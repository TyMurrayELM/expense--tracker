import { supabaseAdmin } from '@/lib/supabase';
import { UserWithPermissions } from '@/types/user';

/**
 * Fetch a user by email along with their branch/department permissions.
 * Returns null if the user does not exist. Email is matched case-insensitively.
 *
 * Shared by the page loader and API routes so authorization decisions use the
 * exact same permission shape everywhere.
 */
export async function getCurrentUserWithPermissions(
  email: string
): Promise<UserWithPermissions | null> {
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (userError || !user) {
    return null;
  }

  const { data: branchPermissions } = await supabaseAdmin
    .from('user_branch_permissions')
    .select('branch_name')
    .eq('user_id', user.id);

  const { data: departmentPermissions } = await supabaseAdmin
    .from('user_department_permissions')
    .select('department_name')
    .eq('user_id', user.id);

  return {
    ...user,
    branches: branchPermissions?.map(bp => bp.branch_name) || [],
    departments: departmentPermissions?.map(dp => dp.department_name) || [],
  };
}
