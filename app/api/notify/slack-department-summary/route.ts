import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Branch + Department -> Slack Channel mapping
const DEPARTMENT_SLACK_CHANNELS: Record<string, Record<string, string>> = {
  'Phoenix - SouthWest': {
    'Maintenance': 'C06J7ULQXV4',
    'Maintenance Recurring': 'C06J7ULQXV4',
    'Maintenance : Maintenance': 'C06J7ULQXV4',
    'Maintenance : Maintenance Recurring': 'C06J7ULQXV4',
    'Irrigation': 'C06J7ULQXV4',
  },
  'Phoenix - SouthEast': {
    'Maintenance': 'C06JT7JU81F',
    'Maintenance Recurring': 'C06JT7JU81F',
    'Maintenance : Maintenance': 'C06JT7JU81F',
    'Maintenance : Maintenance Recurring': 'C06JT7JU81F',
    'Irrigation': 'C06JT7JU81F',
  },
  'Phoenix - North': {
    'Maintenance': 'C0738AHV23H',
    'Maintenance Recurring': 'C0738AHV23H',
    'Maintenance : Maintenance': 'C0738AHV23H',
    'Maintenance : Maintenance Recurring': 'C0738AHV23H',
    'Irrigation': 'C0738AHV23H',
  },
  'Phoenix': {
    'Enhancements': 'C06JTB3QS0Z',
    'Arbor': 'C06JT9Q4A3B',
    'Spray': 'C06U9K3EKT7',
    'PHC': 'C0896PY7EAF',
    'Fleet & Equipment': 'C0896PY7EAF',
  },
  'Las Vegas': {
    'Maintenance': 'C06JBNL7UKX',
    'Maintenance Recurring': 'C06JBNL7UKX',
    'Maintenance : Maintenance': 'C06JBNL7UKX',
    'Maintenance : Maintenance Recurring': 'C06JBNL7UKX',
    'Arbor': 'C06JBNL7UKX',
    'Enhancements': 'C06JBNL7UKX',
    'Irrigation': 'C06JBNL7UKX',
    'Office Operations': 'C06JBNL7UKX',
    'Safety': 'C06JBNL7UKX',
    'PHC': 'C06JBNL7UKX',
  },
  'Corporate': {
    'Safety': 'C0896PY7EAF',
    'Fleet & Equipment': 'C0896PY7EAF',
    'Overhead: Equipment & Fleet Operations': 'C0896PY7EAF',
    'Enhancements': 'C06JTB3QS0Z',
    'Arbor': 'C06JT9Q4A3B',
    'Spray': 'C06U9K3EKT7',
    'PHC': 'C0896PY7EAF',
  },
};

interface DepartmentSummaryRequest {
  branch: string;
  department: string;
  month: string; // YYYY-MM format
  totalAmount: number;
  totalCount: number;
  unapprovedAmount: number;
  unapprovedCount: number;
  dashboardUrl?: string;
}

export async function POST(request: Request) {
  try {
    console.log('=== Slack Department Summary Request Started ===');
    
    // Check authentication
    let session;
    try {
      session = await getServerSession(authOptions);
      console.log('Session retrieved:', !!session);
    } catch (sessionError: any) {
      console.error('Session error:', sessionError);
      return NextResponse.json(
        { success: false, error: 'Session error: ' + sessionError.message },
        { status: 500 }
      );
    }
    
    if (!session || !session.user?.email) {
      console.log('Unauthorized: No session');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Please log in' },
        { status: 401 }
      );
    }

    console.log('Authenticated user:', session.user.email);

    // Parse request body
    let body: DepartmentSummaryRequest;
    try {
      body = await request.json();
      console.log('Request body parsed:', body);
    } catch (parseError: any) {
      console.error('JSON parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const {
      branch,
      department,
      month,
      totalAmount,
      totalCount,
      unapprovedAmount,
      unapprovedCount,
      dashboardUrl,
    } = body;

    // Validate required fields
    if (!branch || !department || !month) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: branch, department, and month are required',
      }, { status: 400 });
    }

    // Find the Slack channel for this branch/department combination
    const branchChannels = DEPARTMENT_SLACK_CHANNELS[branch];
    if (!branchChannels) {
      console.log('No Slack channels configured for branch:', branch);
      return NextResponse.json({
        success: false,
        error: `No Slack channels configured for branch: ${branch}`,
        suggestion: 'This branch/department combination needs to be added to the channel mapping.',
      }, { status: 404 });
    }

    // Try to find the department channel (handle variations like "Maintenance" vs "Maintenance : Maintenance")
    let channelId = branchChannels[department];
    
    // If not found directly, try to find a partial match
    if (!channelId) {
      const departmentKeys = Object.keys(branchChannels);
      
      // Special handling for Maintenance variations - normalize and match
      const normalizedDept = department.toLowerCase().replace(/\s*:\s*/g, ' ').trim();
      const isMaintenanceVariant = normalizedDept.includes('maintenance');
      
      if (isMaintenanceVariant) {
        // Find any maintenance key in the branch channels
        const maintenanceKey = departmentKeys.find(key => 
          key.toLowerCase().includes('maintenance')
        );
        if (maintenanceKey) {
          channelId = branchChannels[maintenanceKey];
        }
      } else {
        // For non-maintenance, try standard partial matching
        const matchingKey = departmentKeys.find(key => 
          department.includes(key) || key.includes(department)
        );
        if (matchingKey) {
          channelId = branchChannels[matchingKey];
        }
      }
    }

    if (!channelId) {
      console.log('No Slack channel configured for department:', department, 'in branch:', branch);
      return NextResponse.json({
        success: false,
        error: `No Slack channel configured for ${department} in ${branch}`,
        suggestion: 'This department needs to be added to the channel mapping.',
      }, { status: 404 });
    }

    console.log('Found Slack channel:', channelId, 'for', branch, '/', department);

    // Format the month for display - parse manually to avoid timezone issues
    const [year, monthNum] = month.split('-');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthDisplay = `${monthNames[parseInt(monthNum, 10) - 1]} ${year}`;

    // Format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    // Clean department name for display
    const cleanDepartmentName = (dept: string) => {
      if (dept.startsWith('Maintenance : Maintenance')) {
        return dept.replace('Maintenance : ', '');
      }
      return dept;
    };

    // Get department emoji based on department name
    const getDepartmentEmoji = (dept: string): string => {
      const lower = dept.toLowerCase();
      if (lower.includes('arbor')) return ':palm_tree:';
      if (lower.includes('enhancement')) return ':enh:';
      if (lower.includes('maintenance')) return ':agave:';
      if (lower.includes('irrigation')) return ':droplet:';
      if (lower.includes('spray') || lower.includes('phc')) return ':pesticide:';
      if (lower.includes('safety')) return ':safety_vest:';
      if (lower.includes('fleet') || lower.includes('equipment')) return ':truck:';
      if (lower.includes('office') || lower.includes('operations')) return ':office:';
      return ':clipboard:'; // Default
    };

    // Get month emoji (e.g., :jan:, :feb:, :dec:)
    const monthAbbreviations = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                                 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthEmoji = `:${monthAbbreviations[parseInt(monthNum, 10) - 1]}:`;
    const deptEmoji = getDepartmentEmoji(department);

    // Build blocks for the Slack message
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Expense Summary: ${branch}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${deptEmoji} *Department:* ${cleanDepartmentName(department)}\n${monthEmoji} *Period:* ${monthDisplay}`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total Expenses*\n*${formatCurrency(totalAmount)}*`,
          },
          {
            type: 'mrkdwn',
            text: `*Transactions*\n*${totalCount}*`,
          },
        ],
      },
    ];

    // Add unapproved section if there are unapproved transactions
    if (unapprovedCount > 0) {
      blocks.push(
        {
          type: 'divider',
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*⚠️ Unapproved*\n*${formatCurrency(unapprovedAmount)}*`,
            },
            {
              type: 'mrkdwn',
              text: `*Pending Review*\n*${unapprovedCount}* transactions`,
            },
          ],
        }
      );
    } else {
      blocks.push(
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '✅ All transactions have been approved!',
            },
          ],
        }
      );
    }

    // Add dashboard link if provided
    if (dashboardUrl) {
      blocks.push(
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${dashboardUrl}|View in Expense Dashboard →>`,
          },
        }
      );
    }

    // Check for Slack token
    const slackToken = process.env.SLACK_API_TOKEN;
    if (!slackToken) {
      console.error('SLACK_API_TOKEN not configured');
      return NextResponse.json({
        success: false,
        error: 'Slack API token not configured on server',
      }, { status: 500 });
    }

    // Build Slack message
    const message = {
      channel: channelId,
      text: `📊 Expense Summary for ${branch} - ${cleanDepartmentName(department)} (${monthDisplay})`,
      blocks: blocks,
    };

    console.log('Sending message to Slack channel:', channelId);

    // Send to Slack
    let slackResponse;
    try {
      slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slackToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      console.log('Slack API response status:', slackResponse.status);
    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json({
        success: false,
        error: `Failed to connect to Slack: ${fetchError.message}`,
      }, { status: 500 });
    }

    // Parse Slack response
    let slackData;
    try {
      const responseText = await slackResponse.text();
      console.log('Slack response length:', responseText.length);
      
      if (!responseText || responseText.trim() === '') {
        throw new Error('Empty response from Slack');
      }

      slackData = JSON.parse(responseText);
      console.log('Slack response parsed. OK:', slackData.ok);
    } catch (parseError: any) {
      console.error('Failed to parse Slack response:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Invalid response from Slack API',
      }, { status: 500 });
    }

    if (!slackData.ok) {
      console.error('Slack API error:', slackData.error);
      return NextResponse.json({
        success: false,
        error: `Slack API error: ${slackData.error}`,
        slackError: slackData.error,
      }, { status: 500 });
    }

    console.log('=== Slack department summary sent successfully ===');
    console.log('Message ID:', slackData.ts);

    return NextResponse.json({
      success: true,
      message: `Summary sent to ${branch} - ${cleanDepartmentName(department)} channel`,
      slackMessageId: slackData.ts,
      slackChannel: slackData.channel,
    });

  } catch (error: any) {
    console.error('=== UNHANDLED ERROR in Slack department summary ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unknown error occurred',
        errorType: error?.constructor?.name || 'Unknown',
      },
      { status: 500 }
    );
  }
}