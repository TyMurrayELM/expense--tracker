import { supabase } from '@/lib/supabase';
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

export default async function Home() {
  const expenses = await getExpenses();
  const { vendors, purchasers } = await getFilterOptions();

  return (
    <PageWrapper
      initialExpenses={expenses}
      vendors={vendors}
      purchasers={purchasers}
    />
  );
}
