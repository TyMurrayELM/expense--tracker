// app/api/expenses/approval/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserWithPermissions } from '@/lib/currentUser';
import { hasAccessToExpense } from '@/lib/permissions';
import { Expense } from '@/types/expense';

const VALID_APPROVAL_STATUSES = ['approved', 'rejected', null];

export async function PATCH(request: Request) {
  try {
    // Get the current user from session
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Load the user (with permissions) and confirm the account is active
    const user = await getCurrentUserWithPermissions(session.user.email);
    if (!user || !user.is_active) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { expenseId, approvalStatus } = body;

    if (!expenseId) {
      return NextResponse.json(
        { success: false, error: 'Expense ID is required' },
        { status: 400 }
      );
    }

    if (!VALID_APPROVAL_STATUSES.includes(approvalStatus)) {
      return NextResponse.json(
        { success: false, error: 'Invalid approval status' },
        { status: 400 }
      );
    }

    // Load the target expense and verify the user is allowed to act on it
    const { data: expense, error: fetchError } = await supabaseAdmin
      .from('expenses')
      .select('id, branch, department')
      .eq('id', expenseId)
      .single();

    if (fetchError || !expense) {
      return NextResponse.json(
        { success: false, error: 'Expense not found' },
        { status: 404 }
      );
    }

    if (!hasAccessToExpense(user, expense as Expense)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const username = user.full_name || user.email;

    // Update the expense with new approval status and tracking info
    const updateData = {
      approval_status: approvalStatus,
      approval_modified_by: username,
      approval_modified_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(updateData)
      .eq('id', expenseId)
      .select()
      .single();

    if (error) {
      console.error('Error updating approval:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update approval' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error: any) {
    console.error('Error in approval API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
