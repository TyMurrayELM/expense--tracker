import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createSlackClient } from '@/lib/slack';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST() {
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

    // Fetch Slack users
    console.log('Fetching Slack users...');
    const slackClient = createSlackClient();
    const slackUsers = await slackClient.fetchUsers();

    if (slackUsers.length === 0) {
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

    console.log(`Found ${slackUsers.length} Slack users`);

    // Fetch all users from database
    const { data: dbUsers, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, slack_id');

    if (fetchError) {
      throw new Error(`Failed to fetch users from database: ${fetchError.message}`);
    }

    // Create email-to-user mapping for faster lookups
    const emailMap = new Map(dbUsers.map(u => [u.email.toLowerCase(), u]));

    let matched = 0;
    let updated = 0;
    let notFound = 0;
    const errors: string[] = [];

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

    console.log('Slack sync completed:', stats);

    return NextResponse.json({
      success: true,
      message: `Synced ${updated} users with Slack data`,
      stats,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Error syncing Slack users:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync Slack users',
      },
      { status: 500 }
    );
  }
}
