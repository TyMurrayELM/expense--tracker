import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import { Expense } from '@/types/expense';

async function getExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .gte('transaction_date', '2025-10-01')
    .order('transaction_date', { ascending: false });

  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }

  return data as Expense[];
}

async function getFilterOptions() {
  // Get unique vendors
  const { data: vendorData } = await supabase
    .from('expenses')
    .select('vendor_name')
    .gte('transaction_date', '2025-10-01');

  // Get unique purchasers (cardholders)
  const { data: purchaserData } = await supabase
    .from('expenses')
    .select('cardholder')
    .not('cardholder', 'is', null)
    .gte('transaction_date', '2025-10-01');

  const vendors = [...new Set(vendorData?.map(d => d.vendor_name) || [])];
  const purchasers = [...new Set(purchaserData?.map(d => d.cardholder) || [])].sort();

  return { vendors, purchasers };
}

async function getCurrentUserWithPermissions(email: string) {
  // Fetch user with permissions
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (userError || !user) {
    return null;
  }

  // Fetch branch permissions
  const { data: branchPermissions } = await supabaseAdmin
    .from('user_branch_permissions')
    .select('branch_name')
    .eq('user_id', user.id);

  // Fetch department permissions
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

export default async function Home() {
  // Check authentication
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user?.email) {
    redirect('/auth/signin');
  }

  // Get current user with permissions
  const currentUser = await getCurrentUserWithPermissions(session.user.email);

  if (!currentUser) {
    redirect('/auth/error?error=UserNotFound');
  }

  if (!currentUser.is_active) {
    redirect('/auth/error?error=AccountInactive');
  }

  // Fetch all expenses and filter options
  const expenses = await getExpenses();
  const { vendors, purchasers } = await getFilterOptions();

  return (
    <PageWrapper
      initialExpenses={expenses}
      vendors={vendors}
      purchasers={purchasers}
      currentUser={currentUser}
    />
  );
}
