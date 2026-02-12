import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get the most recent successful sync log
    const { data: lastSync, error } = await supabaseAdmin
      .from('sync_logs')
      .select('sync_completed_at, status')
      .eq('status', 'success')
      .order('sync_completed_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }

    return NextResponse.json({
      success: true,
      lastSyncTime: lastSync?.sync_completed_at || null,
    });

  } catch (error: any) {
    console.error('Error fetching last sync time:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        lastSyncTime: null,
      },
      { status: 500 }
    );
  }
}