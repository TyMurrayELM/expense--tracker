import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface SlackNotificationRequest {
  expenseId: string;
  purchaserName: string;
  incorrectBranch: string | null;
  correctBranch: string | null;
  incorrectDepartment: string | null;
  correctDepartment: string | null;
  incorrectCategory: string | null;
  correctCategory: string | null;
  vendor: string;
  amount: number;
  date: string;
  memo?: string | null;
  billUrl?: string | null;
  improveDescription?: boolean;
  additionalSlackIds?: string[] | null; // Optional additional recipients
  additionalMessage?: string | null; // Optional additional message
}

export async function POST(request: Request) {
  try {
    console.log('=== Slack Notification Request Started ===');
    
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
    let body: SlackNotificationRequest;
    try {
      body = await request.json();
      console.log('Request body parsed:', {
        expenseId: body.expenseId,
        purchaserName: body.purchaserName,
        vendor: body.vendor,
        memo: body.memo,
        billUrl: body.billUrl,
        improveDescription: body.improveDescription,
        additionalSlackIds: body.additionalSlackIds,
        additionalMessage: body.additionalMessage,
      });
    } catch (parseError: any) {
      console.error('JSON parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const {
      expenseId,
      purchaserName,
      incorrectBranch,
      correctBranch,
      incorrectDepartment,
      correctDepartment,
      incorrectCategory,
      correctCategory,
      vendor,
      amount,
      date,
      memo,
      billUrl,
      improveDescription = false,
      additionalSlackIds,
      additionalMessage,
    } = body;

    // Find user by name (cardholder) - skip for vendor bills with no purchaser
    let targetUser: { id: string; full_name: string; email: string; slack_id: string; slack_display_name: string | null } | null = null;

    if (purchaserName) {
      console.log('Searching for user:', purchaserName);

      let users;
      try {
        const result = await supabaseAdmin
          .from('users')
          .select('id, full_name, email, slack_id, slack_display_name')
          .ilike('full_name', purchaserName);

        if (result.error) {
          throw new Error(`Database error: ${result.error.message}`);
        }

        users = result.data;
        console.log('Users found:', users?.length || 0);
      } catch (dbError: any) {
        console.error('Database error:', dbError);
        return NextResponse.json({
          success: false,
          error: `Failed to find user: ${dbError.message}`,
        }, { status: 500 });
      }

      if (!users || users.length === 0) {
        console.log('No user found with name:', purchaserName);
        return NextResponse.json({
          success: false,
          error: `No user found with name: ${purchaserName}`,
          suggestion: 'User may need to be created first. Try the "Auto-Create Users" button in Admin.',
        }, { status: 404 });
      }

      targetUser = users[0];
      console.log('Target user:', targetUser.email, 'Slack ID:', targetUser.slack_id);

      // Check if user has Slack ID
      if (!targetUser.slack_id) {
        console.log('User has no Slack ID');
        return NextResponse.json({
          success: false,
          error: `User ${purchaserName} doesn't have a Slack ID`,
          suggestion: 'Run "Sync Slack Users" in Admin to link their Slack account.',
        }, { status: 400 });
      }
    } else {
      // No purchaser (vendor bill) - must have additional recipients
      if (!additionalSlackIds || additionalSlackIds.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No purchaser on this expense. Please select at least one recipient.',
        }, { status: 400 });
      }
      console.log('No purchaser - will send to additional recipients only');
    }

    // Build the changes list
    const changes: string[] = [];
    
    if (incorrectBranch !== correctBranch && correctBranch) {
      changes.push(`• *Branch:* ${incorrectBranch || 'Not set'} → ${correctBranch}`);
    }
    
    if (incorrectDepartment !== correctDepartment && correctDepartment) {
      changes.push(`• *Department:* ${incorrectDepartment || 'Not set'} → ${correctDepartment}`);
    }
    
    if (incorrectCategory !== correctCategory && correctCategory) {
      changes.push(`• *Category:* ${incorrectCategory || 'Not set'} → ${correctCategory}`);
    }

    // Add description improvement notice if checked
    if (improveDescription) {
      changes.push(`• *Description:* Please provide a more thorough description of purchase and purpose`);
    }

    if (changes.length === 0) {
      console.log('No changes to notify about');
      return NextResponse.json({
        success: false,
        error: 'No changes to notify about',
      }, { status: 400 });
    }

    console.log('Changes to notify:', changes.length);

    // Build the transaction info text with inline formatting
    let transactionInfo = `*Vendor:* ${vendor}  |  *Amount:* $${amount.toFixed(2)}  |  *Date:* ${date}`;
    
    // Add transaction link if available
    if (billUrl) {
      transactionInfo += `  |  <${billUrl}|View Transaction>`;
    }

    // Build blocks for the Slack message
    const isVendorBill = !targetUser;
    const headerText = isVendorBill
      ? '⚠️ Vendor Bill Correction Required'
      : '⚠️ Credit Card Purchase Correction Required';
    const greetingName = targetUser ? (targetUser.slack_display_name || targetUser.full_name) : '';
    const greetingText = isVendorBill
      ? 'Hey! 👋 A vendor bill needs attention.'
      : `Hey ${greetingName}! 👋 One of your credit card transactions needs attention.`;

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: headerText,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: greetingText,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: transactionInfo,
        },
      },
    ];

    // Add memo/description if it exists
    if (memo) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Description:* ${memo}`,
        },
      });
    }

    // Add divider and corrections
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Please update the following:*\n\n' + changes.join('\n'),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 Please make sure to use the correct Branch, Department, and Category in Bill.com for future expenses to avoid manual corrections.',
          },
        ],
      }
    );

    // Add additional message if provided
    if (additionalMessage && additionalMessage.trim()) {
      blocks.push(
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Additional Note:*\n${additionalMessage.trim()}`,
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

    // Determine channel based on whether we have a target user and/or additional recipients
    let channelId: string | null = targetUser?.slack_id || null;
    let recipientNames = purchaserName || '';

    if (additionalSlackIds && additionalSlackIds.length > 0) {
      // Build the list of all Slack user IDs for the conversation
      const allSlackIds = targetUser
        ? [targetUser.slack_id, ...additionalSlackIds]
        : [...additionalSlackIds];

      console.log('Opening conversation with recipients:', allSlackIds);

      try {
        const conversationResponse = await fetch('https://slack.com/api/conversations.open', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${slackToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            users: allSlackIds.join(','),
          }),
        });

        const conversationData = await conversationResponse.json();

        if (!conversationData.ok) {
          console.error('Failed to open conversation:', conversationData.error);
          return NextResponse.json({
            success: false,
            error: `Failed to create conversation: ${conversationData.error}`,
          }, { status: 500 });
        }

        channelId = conversationData.channel.id;
        console.log('Conversation channel opened:', channelId);

        // Get the additional users' names for confirmation message
        try {
          const additionalUsersResult = await supabaseAdmin
            .from('users')
            .select('full_name')
            .in('slack_id', additionalSlackIds);

          if (additionalUsersResult.data && additionalUsersResult.data.length > 0) {
            const names = additionalUsersResult.data.map(u => u.full_name);
            recipientNames = [purchaserName, ...names].filter(Boolean).join(', ');
          }
        } catch (error) {
          console.log('Could not fetch additional user names, continuing anyway');
        }
      } catch (conversationError: any) {
        console.error('Error opening conversation:', conversationError);
        return NextResponse.json({
          success: false,
          error: `Failed to create conversation: ${conversationError.message}`,
        }, { status: 500 });
      }
    }

    if (!channelId) {
      return NextResponse.json({
        success: false,
        error: 'No recipients determined. Please select at least one recipient.',
      }, { status: 400 });
    }

    // Build Slack message
    const message = {
      channel: channelId,
      text: greetingText,
      blocks: blocks,
    };

    console.log('Sending message to Slack...');

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

    console.log('=== Slack notification sent successfully ===');
    console.log('Message ID:', slackData.ts);

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${recipientNames}`,
      slackMessageId: slackData.ts,
      slackChannel: slackData.channel,
    });

  } catch (error: any) {
    console.error('=== UNHANDLED ERROR in Slack notification ===');
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