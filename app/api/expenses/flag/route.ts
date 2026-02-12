import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { expenseId, flagCategory } = body;

    if (!expenseId) {
      return NextResponse.json(
        { success: false, error: 'Expense ID is required' },
        { status: 400 }
      );
    }

    // If flagCategory is null or empty, we're unflagging
    const updateData = {
      flag_category: flagCategory || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(updateData)
      .eq('id', expenseId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update flag: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      data,
    });

  } catch (error: any) {
    console.error('Flag update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
