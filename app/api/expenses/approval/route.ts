// app/api/expenses/approval/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PATCH(request: Request) {
  try {
    // Get the current user from session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
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

    // Get the username from session
    // Assuming session.user.name contains the full name
    const username = session.user.name || session.user.email || 'Unknown User';

    // Update the expense with new approval status and tracking info
    const updateData: any = {
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
        { success: false, error: error.message },
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
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}