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
    } = body;

    // Find user by name (cardholder)
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

    const targetUser = users[0];
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
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Expense Entry Correction Needed',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Hey ${targetUser.slack_display_name || targetUser.full_name}! 👋 One of your credit card transactions needs attention.`,
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

    // Build Slack message
    const message = {
      channel: targetUser.slack_id,
      text: `Hey ${targetUser.slack_display_name || targetUser.full_name}! 👋 One of your credit card transactions needs attention.`,
      blocks: blocks,
    };

    // Check for Slack token
    const slackToken = process.env.SLACK_API_TOKEN;
    if (!slackToken) {
      console.error('SLACK_API_TOKEN not configured');
      return NextResponse.json({
        success: false,
        error: 'Slack API token not configured on server',
      }, { status: 500 });
    }

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
      message: `Notification sent to ${purchaserName}`,
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