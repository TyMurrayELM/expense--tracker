import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
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