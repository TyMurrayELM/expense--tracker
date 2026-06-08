import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserWithPermissions } from '@/lib/currentUser';
import { FLAG_CATEGORIES } from '@/types/expense';

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Flagging is an admin-only action (the flag column is admin-only in the UI).
    const user = await getCurrentUserWithPermissions(session.user.email);
    if (!user || !user.is_active || !user.is_admin) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { expenseId, flagCategory } = body;

    if (!expenseId) {
      return NextResponse.json(
        { success: false, error: 'Expense ID is required' },
        { status: 400 }
      );
    }

    // Normalize empty string to null (unflag); otherwise must be a known category.
    const normalizedFlag = flagCategory === '' ? null : flagCategory ?? null;
    if (normalizedFlag !== null && !FLAG_CATEGORIES.includes(normalizedFlag)) {
      return NextResponse.json(
        { success: false, error: 'Invalid flag category' },
        { status: 400 }
      );
    }

    const updateData = {
      flag_category: normalizedFlag,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(updateData)
      .eq('id', expenseId)
      .select()
      .single();

    if (error) {
      console.error('Flag update error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update flag' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });

  } catch (error: any) {
    console.error('Flag update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
