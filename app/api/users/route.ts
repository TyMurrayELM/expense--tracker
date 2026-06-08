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

    const { data: authUser } = await supabaseAdmin
      .from('users').select('is_admin')
      .eq('email', session.user.email!.toLowerCase()).single();
    if (!authUser || !authUser.is_admin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

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
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: authUser } = await supabaseAdmin
      .from('users').select('is_admin')
      .eq('email', session.user.email!.toLowerCase()).single();
    if (!authUser || !authUser.is_admin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { email, full_name, is_admin, can_send_slack, branches, departments } = body;

    if (!email || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Email and full name are required' },
        { status: 400 }
      );
    }

    // Normalize + validate the email against the allowed domain. The session/jwt
    // callbacks look users up by lowercased email, so a mixed-case or off-domain
    // row would never match a real login (silent dead row / allowlist bypass).
    const normalizedEmail = String(email).trim().toLowerCase();
    const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || 'encorelm.com';
    if (!normalizedEmail.endsWith(`@${allowedDomain}`)) {
      return NextResponse.json(
        { success: false, error: `Email must be a @${allowedDomain} address` },
        { status: 400 }
      );
    }

    // Coerce permission lists to string arrays of known-shape values.
    const branchList: string[] = Array.isArray(branches) ? branches.filter((b: unknown) => typeof b === 'string') : [];
    const departmentList: string[] = Array.isArray(departments) ? departments.filter((d: unknown) => typeof d === 'string') : [];

    // Create user
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        email: normalizedEmail,
        full_name,
        is_admin: is_admin || false,
        is_active: true,
        can_send_slack: can_send_slack || false,
      })
      .select()
      .single();

    if (userError) {
      throw new Error(`Failed to create user: ${userError.message}`);
    }

    // Add branch permissions
    if (branchList.length > 0) {
      const branchPermissions = branchList.map((branch: string) => ({
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
    if (departmentList.length > 0) {
      const departmentPermissions = departmentList.map((department: string) => ({
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
        branches: branchList,
        departments: departmentList,
      },
    });

  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
