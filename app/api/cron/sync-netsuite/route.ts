import { NextResponse } from 'next/server';
import { createNetSuiteClient } from '@/lib/netsuite';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized cron request - invalid secret');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('=== CRON: Starting Automated Vendor Bill Sync ===');
    console.log('Time:', new Date().toISOString());
    
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

    // Process each vendor bill
    for (const bill of bills) {
      try {
        // Fetch full bill details and expense lines
        let billDetails = null;
        let expenseLines = null;
        
        try {
          billDetails = await nsClient.getVendorBillDetails(bill.id.toString());
          expenseLines = await nsClient.getVendorBillExpenseLines(bill.id.toString());
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
        
        // Extract from expense lines
        let department = null;
        let branch = null;
        let category = null;
        let memo = null;

        if (expenseLines?.items && expenseLines.items.length > 0) {
          const firstLine = expenseLines.items[0];
          department = firstLine.department?.refName || null;
          branch = firstLine.location?.refName || null;
          category = firstLine.category?.refName || firstLine.account?.refName || null;
          memo = firstLine.memo || billDetails?.memo || null;
        } else if (billDetails) {
          memo = billDetails.memo || null;
        }

        const netsuiteId = bill.id.toString();

        // Determine flag category - PRESERVE existing flag if it exists
        const existingFlag = existingFlagsMap.get(netsuiteId);
        let flagCategory = existingFlag || null;
        
        if (existingFlag) {
          flagsPreserved++;
        }

        const expenseData = {
          netsuite_id: netsuiteId,
          vendor: vendorName,
          date: bill.trandate,
          amount,
          memo,
          branch,
          department,
          category,
          cardholder: null, // Vendor bills don't have cardholders
          transaction_type: 'Vendor Bill',
          sync_status: status,
          flag_category: flagCategory,
          last_synced_at: new Date().toISOString(),
        };

        console.log(`Processing: ${vendorName} - $${amount} - ${branch || 'No Branch'} - ${memo || 'No Memo'}`);

        // Check if record exists BEFORE upsert
        const { data: existingRecord } = await supabaseAdmin
          .from('expenses')
          .select('netsuite_id')
          .eq('netsuite_id', netsuiteId)
          .single();

        const isNewRecord = !existingRecord;

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

    console.log('=== CRON: Vendor Bill Sync Completed Successfully ===');

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
    console.error('=== CRON: Vendor Bill Sync Error ===');
    console.error('Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}