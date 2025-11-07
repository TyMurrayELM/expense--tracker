import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createSlackClient } from '@/lib/slack';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: Request) {
  // Wrap everything in try-catch to ensure we always return JSON
  try {
    console.log('=== Slack Sync Started ===');
    
    // Check if user is authenticated and is admin
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
      console.log('Unauthorized: No session or email');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('User email:', session.user.email);

    // Verify user is admin
    let user;
    try {
      const result = await supabaseAdmin
        .from('users')
        .select('is_admin')
        .eq('email', session.user.email.toLowerCase())
        .single();
      
      user = result.data;
      console.log('User found:', !!user, 'Is admin:', user?.is_admin);
      
      if (result.error) {
        console.error('Supabase error fetching user:', result.error);
      }
    } catch (dbError: any) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + dbError.message },
        { status: 500 }
      );
    }

    if (!user || !user.is_admin) {
      console.log('Access denied: Not admin');
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Fetch Slack users
    console.log('Creating Slack client...');
    let slackClient;
    try {
      slackClient = createSlackClient();
      console.log('Slack client created');
    } catch (clientError: any) {
      console.error('Slack client creation error:', clientError);
      return NextResponse.json(
        { success: false, error: 'Slack client error: ' + clientError.message },
        { status: 500 }
      );
    }

    console.log('Fetching Slack users...');
    let slackUsers;
    try {
      slackUsers = await slackClient.fetchUsers();
      console.log(`Fetched ${slackUsers.length} Slack users`);
    } catch (slackError: any) {
      console.error('Slack API error:', slackError);
      return NextResponse.json(
        { success: false, error: 'Slack API error: ' + slackError.message },
        { status: 500 }
      );
    }

    if (slackUsers.length === 0) {
      console.log('No Slack users found');
      return NextResponse.json({
        success: true,
        message: 'No Slack users found',
        stats: {
          total: 0,
          matched: 0,
          updated: 0,
          notFound: 0,
        },
      });
    }

    // Fetch all users from database
    console.log('Fetching database users...');
    let dbUsers;
    try {
      const result = await supabaseAdmin
        .from('users')
        .select('id, email, slack_id');

      if (result.error) {
        throw new Error(`Failed to fetch users from database: ${result.error.message}`);
      }
      
      dbUsers = result.data || [];
      console.log(`Fetched ${dbUsers.length} database users`);
    } catch (dbError: any) {
      console.error('Database fetch error:', dbError);
      return NextResponse.json(
        { success: false, error: 'Database fetch error: ' + dbError.message },
        { status: 500 }
      );
    }

    // Create email-to-user mapping for faster lookups
    const emailMap = new Map(dbUsers.map(u => [u.email.toLowerCase(), u]));

    let matched = 0;
    let updated = 0;
    let notFound = 0;
    const errors: string[] = [];

    console.log('Starting user matching...');

    // Match Slack users with database users by email
    for (const slackUser of slackUsers) {
      const dbUser = emailMap.get(slackUser.email);

      if (!dbUser) {
        // User exists in Slack but not in our database
        notFound++;
        console.log(`User not found in database: ${slackUser.email}`);
        continue;
      }

      matched++;

      // Check if Slack data needs updating
      const needsUpdate = dbUser.slack_id !== slackUser.slackId;

      if (needsUpdate) {
        // Update user with Slack data
        try {
          const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
              slack_id: slackUser.slackId,
              slack_display_name: slackUser.displayName,
              slack_synced_at: new Date().toISOString(),
            })
            .eq('id', dbUser.id);

          if (updateError) {
            errors.push(`Failed to update ${slackUser.email}: ${updateError.message}`);
            console.error(`Error updating user ${slackUser.email}:`, updateError);
          } else {
            updated++;
            console.log(`Updated Slack data for: ${slackUser.email}`);
          }
        } catch (updateError: any) {
          errors.push(`Exception updating ${slackUser.email}: ${updateError.message}`);
          console.error(`Exception updating user ${slackUser.email}:`, updateError);
        }
      } else {
        console.log(`Slack data already up to date for: ${slackUser.email}`);
      }
    }

    const stats = {
      total: slackUsers.length,
      matched,
      updated,
      notFound,
    };

    console.log('=== Slack sync completed ===');
    console.log('Stats:', stats);

    return NextResponse.json({
      success: true,
      message: `Synced ${updated} users with Slack data`,
      stats,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    // This is the ultimate catch-all
    console.error('=== UNHANDLED ERROR in Slack sync ===');
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
