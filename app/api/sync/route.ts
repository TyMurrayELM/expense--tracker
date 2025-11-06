import { NextResponse } from 'next/server';
import { createNetSuiteClient } from '@/lib/netsuite';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    // Create sync log
    const { data: syncLog, error: syncLogError } = await supabaseAdmin
      .from('sync_logs')
      .insert({
        status: 'running',
        sync_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (syncLogError) {
      throw new Error(`Failed to create sync log: ${syncLogError.message}`);
    }

    // Initialize NetSuite client
    const nsClient = createNetSuiteClient();

    // Fetch vendor bills from NetSuite starting from Q4 2025 (Oct 1, 2025)
    const fromDate = '2025-10-01';
    console.log('Fetching vendor bills from NetSuite...');
    
    const result = await nsClient.searchVendorBills(fromDate);
    const bills = result.items || [];

    console.log(`Found ${bills.length} vendor bills`);

    let recordsCreated = 0;
    let recordsUpdated = 0;
    const errors: any[] = [];

    // Process each vendor bill
    for (const bill of bills) {
      try {
        // Fetch full bill details and expense lines
        let billDetails = null;
        let expenseLines = null;
        
        try {
          billDetails = await nsClient.getVendorBillDetails(bill.id.toString());
          
          // Fetch expense line items separately
          expenseLines = await nsClient.getVendorBillExpenseLines(bill.id.toString());
          
          // Log first bill's expense lines for debugging
          if (bills.indexOf(bill) === 0 && expenseLines) {
            console.log('=== FIRST BILL EXPENSE LINES ===');
            console.log(JSON.stringify(expenseLines, null, 2));
            console.log('=== END EXPENSE LINES ===');
          }
        } catch (billError) {
          console.log(`Could not fetch bill/expense details for ${bill.id}`);
        }

        // Fetch vendor name
        let vendorName = `Vendor ID: ${bill.entity}`;
        
        try {
          const vendorDetails = await nsClient.getVendorDetails(bill.entity.toString());
          if (vendorDetails) {
            vendorName = vendorDetails.companyName || 
                        vendorDetails.entityId || 
                        vendorDetails.altName ||
                        `Vendor ID: ${bill.entity}`;
          }
        } catch (vendorError) {
          console.log(`Could not fetch vendor name for ${bill.entity}`);
        }

        // Extract fields from bill details
        const amount = billDetails?.total || billDetails?.userTotal || 0;
        const status = billDetails?.status?.refName || billDetails?.status?.id || null;
        const currency = billDetails?.currency?.refName || 'USD';
        
        // Extract from expense lines (which should have the items array)
        let department = null;
        let branch = null;
        let category = null;
        let memo = null;
        
        if (expenseLines?.items && expenseLines.items.length > 0) {
          const firstExpense = expenseLines.items[0];
          
          // Extract department
          department = firstExpense.department?.refName || null;
          
          // Extract branch (location)
          branch = firstExpense.location?.refName || null;
          
          // Extract category (account)
          category = firstExpense.account?.refName || null;
          
          // Extract expense line memo
          memo = firstExpense.memo || null;
          
          console.log(`Expense line data - Branch: ${branch}, Dept: ${department}, Category: ${category}, Memo: ${memo}`);
        } else {
          console.log(`No expense line items found for bill ${bill.id}`);
        }
        
        // Fallback to header memo if no expense line memo
        if (!memo) {
          memo = billDetails?.memo || bill.tranid || null;
        }

const expenseData = {
  netsuite_id: bill.id.toString(),
  transaction_date: bill.trandate,
  vendor_name: vendorName,
  amount: parseFloat(amount) || 0,
  currency: currency,
  status: status,
  department: department,
  branch: branch,
  memo: memo,
  category: category,
  transaction_type: 'Vendor Bill',  // <-- ADD THIS LINE
  last_synced_at: new Date().toISOString(),
};

        console.log(`Processing: ${vendorName} - $${amount} - ${branch || 'No Branch'} - ${memo || 'No Memo'}`);

        // Upsert to Supabase
        const { error: upsertError } = await supabaseAdmin
          .from('expenses')
          .upsert(expenseData, {
            onConflict: 'netsuite_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          errors.push({
            netsuite_id: bill.id,
            vendor: vendorName,
            error: upsertError.message,
          });
        } else {
          // Check if it was an insert or update
          const { data: existing } = await supabaseAdmin
            .from('expenses')
            .select('created_at, updated_at')
            .eq('netsuite_id', bill.id.toString())
            .single();

          if (existing && existing.created_at === existing.updated_at) {
            recordsCreated++;
          } else {
            recordsUpdated++;
          }
        }
      } catch (error: any) {
        console.error(`Error processing bill ${bill.id}:`, error);
        errors.push({
          netsuite_id: bill.id,
          vendor: bill.entity,
          error: error.message,
        });
      }
    }

    // Update sync log
    await supabaseAdmin
      .from('sync_logs')
      .update({
        sync_completed_at: new Date().toISOString(),
        records_fetched: bills.length,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        errors: errors.length > 0 ? errors : null,
        status: errors.length === bills.length ? 'failed' : errors.length > 0 ? 'partial' : 'success',
      })
      .eq('id', syncLog.id);

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${recordsCreated} created, ${recordsUpdated} updated`,
      stats: {
        fetched: bills.length,
        created: recordsCreated,
        updated: recordsUpdated,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
