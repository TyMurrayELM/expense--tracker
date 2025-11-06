import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;
    const body = await request.json();
    const { full_name, is_admin, is_active, branches, departments } = body;

    // Update user basic info
    const updateData: any = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (is_admin !== undefined) updateData.is_admin = is_admin;
    if (is_active !== undefined) updateData.is_active = is_active;

    let user = null;
    if (Object.keys(updateData).length > 0) {
      const { data, error: userError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (userError) {
        throw new Error(`Failed to update user: ${userError.message}`);
      }
      user = data;
    } else {
      // If no user fields to update, just fetch the user
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch user: ${error.message}`);
      }
      user = data;
    }

    // Update branch permissions if provided
    if (branches !== undefined) {
      // Delete existing permissions
      await supabaseAdmin
        .from('user_branch_permissions')
        .delete()
        .eq('user_id', userId);

      // Add new permissions
      if (branches.length > 0) {
        const branchPermissions = branches.map((branch: string) => ({
          user_id: userId,
          branch_name: branch,
        }));

        const { error: branchError } = await supabaseAdmin
          .from('user_branch_permissions')
          .insert(branchPermissions);

        if (branchError) {
          console.error('Failed to update branch permissions:', branchError);
        }
      }
    }

    // Update department permissions if provided
    if (departments !== undefined) {
      // Delete existing permissions
      await supabaseAdmin
        .from('user_department_permissions')
        .delete()
        .eq('user_id', userId);

      // Add new permissions
      if (departments.length > 0) {
        const departmentPermissions = departments.map((department: string) => ({
          user_id: userId,
          department_name: department,
        }));

        const { error: departmentError } = await supabaseAdmin
          .from('user_department_permissions')
          .insert(departmentPermissions);

        if (departmentError) {
          console.error('Failed to update department permissions:', departmentError);
        }
      }
    }

    // Fetch updated permissions
    const { data: branchPermissions } = await supabaseAdmin
      .from('user_branch_permissions')
      .select('branch_name')
      .eq('user_id', userId);

    const { data: departmentPermissions } = await supabaseAdmin
      .from('user_department_permissions')
      .select('department_name')
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      user: {
        ...user,
        branches: branchPermissions?.map(bp => bp.branch_name) || [],
        departments: departmentPermissions?.map(dp => dp.department_name) || [],
      },
    });

  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;

    // Delete user (cascade will handle permissions)
    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });

  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
