import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import { Expense } from '@/types/expense';
import { getCurrentUserWithPermissions } from '@/lib/currentUser';
import { filterExpensesByPermissions } from '@/lib/permissions';

// Vendors to exclude from the dashboard (data stays in DB)
const EXCLUDED_VENDORS = ['Blue Cross - Portal'];

async function getExpenses() {
  const allExpenses: Expense[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    // The id tiebreaker makes the page order stable: ordering by transaction_date
    // alone lets rows with equal dates shuffle between page queries, duplicating
    // or dropping rows (and silently skewing every KPI).
    // Explicit column list: this entire result set is serialized into the page
    // payload, so columns the UI never reads (sync timestamps, created/updated)
    // are dead weight on every load.
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('id, netsuite_id, transaction_date, vendor_name, amount, currency, status, department, branch, memo, category, transaction_type, cardholder, flag_category, approval_status, approval_modified_by, approval_modified_at, bill_sync_status, slack_notification_count, slack_last_notified_at')
      .gte('transaction_date', '2025-10-01')
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      // Throw instead of returning a partial dataset — incomplete totals with no
      // indication are worse than an error page.
      throw new Error(`Failed to fetch expenses: ${error.message}`);
    }

    allExpenses.push(...(data as Expense[]));

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const filtered = allExpenses.filter(e => !EXCLUDED_VENDORS.includes(e.vendor_name));
  console.log(`Fetched ${allExpenses.length} total expenses, ${filtered.length} after vendor exclusions`);
  return filtered;
}

// Derive the vendor/purchaser dropdown options from a given set of expenses.
// Deriving from the (already permission-scoped) expenses the user will receive
// means non-admins never get the full vendor/purchaser name lists in their payload.
function deriveFilterOptions(expenses: Expense[]) {
  const vendorSet = new Set<string>();
  const purchaserSet = new Set<string>();
  for (const e of expenses) {
    if (e.vendor_name && !EXCLUDED_VENDORS.includes(e.vendor_name)) vendorSet.add(e.vendor_name);
    if (e.cardholder) purchaserSet.add(e.cardholder);
  }
  return {
    vendors: [...vendorSet].sort(),
    purchasers: [...purchaserSet].sort(),
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

  // Fetch all expenses, then scope to what this user is allowed to see BEFORE it
  // leaves the server. Admins receive the full set (required for masquerade);
  // non-admins only receive their permitted rows. Filter options are derived from
  // the scoped set so vendor/purchaser names don't leak either.
  const allExpenses = await getExpenses();
  const visibleExpenses = filterExpensesByPermissions(allExpenses, currentUser);
  const { vendors, purchasers } = deriveFilterOptions(visibleExpenses);

  return (
    <PageWrapper
      initialExpenses={visibleExpenses}
      vendors={vendors}
      purchasers={purchasers}
      currentUser={currentUser}
    />
  );
}
