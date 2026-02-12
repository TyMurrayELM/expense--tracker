import { NextResponse } from 'next/server';
import { createNetSuiteClient } from '@/lib/netsuite';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST() {
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

    console.log('=== Starting Vendor Bill Sync ===');
    
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

    console.log('Sync log created with ID:', syncLog.id);

    // Initialize NetSuite client
    const nsClient = createNetSuiteClient();

    // Fetch vendor bills from NetSuite starting from Jan 1, 2026
    const fromDate = '2026-01-01';
    console.log('Fetching vendor bills from NetSuite...');
    
    const result = await nsClient.searchVendorBills(fromDate);
    const bills = result.items || [];

    console.log(`Found ${bills.length} vendor bills`);

    // PERFORMANCE OPTIMIZATION: Fetch all existing flags in one query
    console.log('Fetching existing flags for preservation...');
    const netsuiteIds = bills.map((bill: any) => bill.id.toString());
    const { data: existingFlags } = await supabaseAdmin
      .from('expenses')
      .select('netsuite_id, flag_category')
      .in('netsuite_id', netsuiteIds);
    
    // Create a map for quick lookup
    const existingFlagsMap = new Map(
      (existingFlags || []).map(e => [e.netsuite_id, e.flag_category])
    );
    console.log(`Found ${existingFlagsMap.size} existing records with potential flags`);

    let recordsCreated = 0;
    let recordsUpdated = 0;
    let flagsPreserved = 0;
    const errors: any[] = [];

    // Cache vendor names to avoid redundant API calls
    const vendorCache = new Map<string, string>();

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

        // Fetch vendor name (use cache to avoid redundant API calls)
        const vendorId = bill.entity.toString();
        let vendorName = `Vendor ID: ${bill.entity}`;

        if (vendorCache.has(vendorId)) {
          vendorName = vendorCache.get(vendorId)!;
        } else {
          try {
            const vendorDetails = await nsClient.getVendorDetails(vendorId);
            if (vendorDetails) {
              vendorName = vendorDetails.companyName ||
                          vendorDetails.entityId ||
                          vendorDetails.altName ||
                          `Vendor ID: ${bill.entity}`;
            }
            vendorCache.set(vendorId, vendorName);
            console.log(`Cached vendor ${vendorId}: ${vendorName}`);
          } catch (vendorError) {
            console.log(`Could not fetch vendor name for ${bill.entity}`);
          }
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

        // FLAG PRESERVATION LOGIC: Check if record exists with a manually-set flag
        const netsuiteId = bill.id.toString();
        const existingFlag = existingFlagsMap.get(netsuiteId);
        
        let flagCategory = null;
        if (existingFlag) {
          // Preserve existing flag - user manually set it
          flagCategory = existingFlag;
          flagsPreserved++;
        }

        const expenseData = {
          netsuite_id: netsuiteId,
          transaction_date: bill.trandate,
          vendor_name: vendorName,
          amount: parseFloat(amount) || 0,
          currency: currency,
          status: status,
          department: department,
          branch: branch,
          memo: memo,
          category: category,
          transaction_type: 'Vendor Bill',
          cardholder: null, // Vendor bills don't have cardholders
          flag_category: flagCategory,
          last_synced_at: new Date().toISOString(),
        };

        console.log(`Processing: ${vendorName} - $${amount} - ${branch || 'No Branch'} - ${memo || 'No Memo'}`);

        // Check if record exists BEFORE upsert (include branch/department for change detection)
        const { data: existingRecord } = await supabaseAdmin
          .from('expenses')
          .select('netsuite_id, branch, department')
          .eq('netsuite_id', netsuiteId)
          .single();

        const isNewRecord = !existingRecord;

        // Log branch/department changes for debugging
        if (existingRecord) {
          const oldBranch = existingRecord.branch;
          const oldDept = existingRecord.department;

          if (oldBranch !== branch) {
            console.log(`Updating branch: ${oldBranch ?? 'null'} → ${branch ?? 'null'} for netsuite_id: ${netsuiteId}`);
            console.log('Full expenseData for changed record:', JSON.stringify(expenseData, null, 2));
          }

          if (oldDept !== department) {
            console.log(`Updating department: ${oldDept ?? 'null'} → ${department ?? 'null'} for netsuite_id: ${netsuiteId}`);
            if (oldBranch === branch) {
              // Only log expenseData if we haven't already logged it for a branch change
              console.log('Full expenseData for changed record:', JSON.stringify(expenseData, null, 2));
            }
          }
        }

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
          // Track if it was created or updated
          if (isNewRecord) {
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

    console.log(`✓ Processing complete: ${recordsCreated} created, ${recordsUpdated} updated`);
    console.log(`Flags preserved: ${flagsPreserved}`);

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
      message: `Vendor bill sync completed: ${recordsCreated} created, ${recordsUpdated} updated, ${flagsPreserved} flags preserved`,
      stats: {
        fetched: bills.length,
        created: recordsCreated,
        updated: recordsUpdated,
        flagsPreserved: flagsPreserved,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Vendor bill sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}