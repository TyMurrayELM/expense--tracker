// GET /api/notify/slack/history?expenseId=<uuid>
// Notification history for one expense, newest first. The notify modal uses
// the latest row to prefill a follow-up and renders the rest as history.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Same gate as sending: admin or can_send_slack
    const { data: authUser } = await supabaseAdmin
      .from('users')
      .select('is_admin, can_send_slack, is_active')
      .eq('email', session.user.email.toLowerCase())
      .single();
    if (!authUser || !authUser.is_active || (!authUser.is_admin && !authUser.can_send_slack)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const expenseId = new URL(request.url).searchParams.get('expenseId');
    if (!expenseId) {
      return NextResponse.json({ success: false, error: 'expenseId required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('expense_notifications')
      .select('id, sent_by, sent_at, send_mode, channel_id, additional_slack_ids, correct_branch, correct_department, correct_category, improve_description, additional_message')
      .eq('expense_id', expenseId)
      .order('sent_at', { ascending: false })
      .limit(10);

    if (error) {
      // Table not created yet (sql/expense_notifications.sql) — treat as empty
      // history rather than an error so the modal still works.
      console.error('History fetch error:', error.message);
      return NextResponse.json({ success: true, history: [] });
    }

    return NextResponse.json({ success: true, history: data ?? [] });
  } catch (error: any) {
    console.error('History route error:', error?.message);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
