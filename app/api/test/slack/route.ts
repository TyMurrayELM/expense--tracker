import { NextResponse } from 'next/server';
import { createSlackClient } from '@/lib/slack';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Check if user is authenticated and is admin
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is admin
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email.toLowerCase())
      .single();

    if (!user || !user.is_admin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Check if token is set
    if (!process.env.SLACK_API_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'SLACK_API_TOKEN environment variable is not set',
        details: {
          tokenExists: false,
          tokenLength: 0,
        },
      });
    }

    const tokenLength = process.env.SLACK_API_TOKEN.length;
    const tokenPrefix = process.env.SLACK_API_TOKEN.substring(0, 10);

    console.log('Testing Slack connection...');
    console.log('Token length:', tokenLength);
    console.log('Token prefix:', tokenPrefix);

    // Create client and test connection
    const slackClient = createSlackClient();
    const connectionTest = await slackClient.testConnection();

    if (!connectionTest.success) {
      return NextResponse.json({
        success: false,
        error: 'Slack API connection test failed',
        details: {
          tokenExists: true,
          tokenLength,
          tokenPrefix,
          connectionError: connectionTest.message,
        },
      });
    }

    // Try to fetch users
    console.log('Fetching users...');
    const users = await slackClient.fetchUsers();

    return NextResponse.json({
      success: true,
      message: 'Slack API connection successful',
      details: {
        tokenExists: true,
        tokenLength,
        tokenPrefix,
        connectionMessage: connectionTest.message,
        totalUsers: users.length,
        sampleUsers: users.slice(0, 3).map(u => ({
          email: u.email,
          displayName: u.displayName,
        })),
      },
    });

  } catch (error: any) {
    console.error('Error testing Slack connection:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to test Slack connection',
        details: {
          errorType: error.constructor.name,
          errorStack: error.stack?.substring(0, 500),
        },
      },
      { status: 500 }
    );
  }
}
