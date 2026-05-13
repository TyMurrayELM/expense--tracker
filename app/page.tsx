import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import { Expense } from '@/types/expense';

// Vendors to exclude from the dashboard (data stays in DB)
const EXCLUDED_VENDORS = ['Blue Cross - Portal'];

async function getExpenses() {
  const allExpenses: Expense[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .gte('transaction_date', '2025-10-01')
      .order('transaction_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching expenses:', error);
      break;
    }

    allExpenses.push(...(data as Expense[]));

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const filtered = allExpenses.filter(e => !EXCLUDED_VENDORS.includes(e.vendor_name));
  console.log(`Fetched ${allExpenses.length} total expenses, ${filtered.length} after vendor exclusions`);
  return filtered;
}

async function getFilterOptions() {
  const PAGE_SIZE = 1000;

  const vendorSet = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('vendor_name')
      .gte('transaction_date', '2025-10-01')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('Error fetching vendors for filter options:', error);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.vendor_name) vendorSet.add(row.vendor_name);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const purchaserSet = new Set<string>();
  offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('cardholder')
      .not('cardholder', 'is', null)
      .gte('transaction_date', '2025-10-01')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('Error fetching purchasers for filter options:', error);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.cardholder) purchaserSet.add(row.cardholder);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const vendors = [...vendorSet].filter(v => !EXCLUDED_VENDORS.includes(v)).sort();
  const purchasers = [...purchaserSet].sort();

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
// test comment 
