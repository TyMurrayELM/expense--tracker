import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { expenseId, approvalStatus } = body;

    if (!expenseId) {
      return NextResponse.json(
        { success: false, error: 'Expense ID is required' },
        { status: 400 }
      );
    }

    // Validate approval status
    if (approvalStatus !== null && approvalStatus !== 'approved' && approvalStatus !== 'rejected') {
      return NextResponse.json(
        { success: false, error: 'Invalid approval status. Must be null, "approved", or "rejected"' },
        { status: 400 }
      );
    }

    console.log(`Updating approval status for expense ${expenseId} to:`, approvalStatus);

    // Update the expense approval status in the database
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update({ approval_status: approvalStatus })
      .eq('id', expenseId)
      .select()
      .single();

    if (error) {
      console.error('Error updating approval status:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('Successfully updated approval status:', data);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error in approval update endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}