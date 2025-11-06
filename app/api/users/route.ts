import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Fetch all users
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('full_name', { ascending: true });

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    // Fetch all branch permissions
    const { data: branchPermissions, error: branchError } = await supabaseAdmin
      .from('user_branch_permissions')
      .select('*');

    if (branchError) {
      throw new Error(`Failed to fetch branch permissions: ${branchError.message}`);
    }

    // Fetch all department permissions
    const { data: departmentPermissions, error: departmentError } = await supabaseAdmin
      .from('user_department_permissions')
      .select('*');

    if (departmentError) {
      throw new Error(`Failed to fetch department permissions: ${departmentError.message}`);
    }

    // Combine users with their permissions
    const usersWithPermissions = users.map(user => ({
      ...user,
      branches: branchPermissions
        .filter(bp => bp.user_id === user.id)
        .map(bp => bp.branch_name),
      departments: departmentPermissions
        .filter(dp => dp.user_id === user.id)
        .map(dp => dp.department_name),
    }));

    return NextResponse.json({
      success: true,
      users: usersWithPermissions,
    });

  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, full_name, is_admin, branches, departments } = body;

    if (!email || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Email and full name are required' },
        { status: 400 }
      );
    }

    // Create user
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        email,
        full_name,
        is_admin: is_admin || false,
        is_active: true,
      })
      .select()
      .single();

    if (userError) {
      throw new Error(`Failed to create user: ${userError.message}`);
    }

    // Add branch permissions
    if (branches && branches.length > 0) {
      const branchPermissions = branches.map((branch: string) => ({
        user_id: user.id,
        branch_name: branch,
      }));

      const { error: branchError } = await supabaseAdmin
        .from('user_branch_permissions')
        .insert(branchPermissions);

      if (branchError) {
        console.error('Failed to add branch permissions:', branchError);
      }
    }

    // Add department permissions
    if (departments && departments.length > 0) {
      const departmentPermissions = departments.map((department: string) => ({
        user_id: user.id,
        department_name: department,
      }));

      const { error: departmentError } = await supabaseAdmin
        .from('user_department_permissions')
        .insert(departmentPermissions);

      if (departmentError) {
        console.error('Failed to add department permissions:', departmentError);
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        ...user,
        branches: branches || [],
        departments: departments || [],
      },
    });

  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
