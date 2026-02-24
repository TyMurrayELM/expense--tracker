import { NextResponse } from 'next/server';
import { createNetSuiteClient } from '@/lib/netsuite';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const maxDuration = 60;

// GL account/category prefixes to exclude from sync
const EXCLUDED_CATEGORY_PREFIXES = [
  '6150.2.2',
];

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

    // Fetch all bill data + expense lines + vendor names in one bulk SuiteQL query
    const fromDate = '2026-02-01';
    console.log('Fetching vendor bills with details from NetSuite...');

    const allBills = await nsClient.searchVendorBillsFull(fromDate);
    const bills = allBills.filter((bill: any) =>
      !bill.category || !EXCLUDED_CATEGORY_PREFIXES.some(prefix => bill.category.startsWith(prefix))
    );
    console.log(`Found ${allBills.length} expense line rows, ${allBills.length - bills.length} excluded by category, ${bills.length} to sync`);

    // --- Old-record cleanup: migrate old single-record-per-bill format for Feb+ ---
    console.log('Checking for old-format Feb+ records to migrate...');
    const { data: oldFormatRecords } = await supabaseAdmin
      .from('expenses')
      .select('netsuite_id, flag_category, approval_status, approval_modified_by, approval_modified_at')
      .eq('transaction_type', 'Vendor Bill')
      .gte('transaction_date', '2026-02-01')
      .not('netsuite_id', 'like', '%-%');

    // Save flags from old-format records keyed by bill ID
    const oldFlagsMap = new Map<string, any>();
    if (oldFormatRecords && oldFormatRecords.length > 0) {
      for (const rec of oldFormatRecords) {
        oldFlagsMap.set(rec.netsuite_id, {
          flag_category: rec.flag_category,
          approval_status: rec.approval_status,
          approval_modified_by: rec.approval_modified_by,
          approval_modified_at: rec.approval_modified_at,
        });
      }
      console.log(`Found ${oldFormatRecords.length} old-format records, deleting...`);
      const oldIds = oldFormatRecords.map(r => r.netsuite_id);
      for (let i = 0; i < oldIds.length; i += 500) {
        const batch = oldIds.slice(i, i + 500);
        await supabaseAdmin.from('expenses').delete().in('netsuite_id', batch);
      }
      console.log(`Deleted ${oldIds.length} old-format records (flags saved for migration)`);
    } else {
      console.log('No old-format records to migrate');
    }

    // Build netsuite_id for each row: {billId}-{lineNumber} or {billId} if no line
    const newNetsuiteIds = bills.map((bill: any) =>
      bill.linesequencenumber != null
        ? `${bill.id}-${bill.linesequencenumber}`
        : bill.id.toString()
    );

    // Fetch existing records for flag preservation and change detection
    console.log('Fetching existing records...');
    const existingRecords: any[] = [];
    for (let i = 0; i < newNetsuiteIds.length; i += 500) {
      const batch = newNetsuiteIds.slice(i, i + 500);
      const { data } = await supabaseAdmin
        .from('expenses')
        .select('netsuite_id, flag_category, approval_status, approval_modified_by, approval_modified_at, branch, department')
        .in('netsuite_id', batch);
      existingRecords.push(...(data || []));
    }

    const existingMap = new Map(
      existingRecords.map(e => [e.netsuite_id, e])
    );
    console.log(`Found ${existingMap.size} existing records`);

    let recordsCreated = 0;
    let recordsUpdated = 0;
    let flagsPreserved = 0;
    const errors: any[] = [];

    // Build expense data array
    const expenseDataList: any[] = [];

    for (const bill of bills) {
      const netsuiteId = bill.linesequencenumber != null
        ? `${bill.id}-${bill.linesequencenumber}`
        : bill.id.toString();
      const existing = existingMap.get(netsuiteId);
      const memo = bill.line_memo || bill.header_memo || bill.tranid || null;
      const amount = bill.line_amount != null ? bill.line_amount : bill.bill_total;

      // Flag preservation: check existing line record first, then old-format bill record
      let flagCategory = null;
      let approvalStatus = null;
      let approvalModifiedBy = null;
      let approvalModifiedAt = null;

      if (existing?.flag_category || existing?.approval_status) {
        flagCategory = existing.flag_category;
        approvalStatus = existing.approval_status;
        approvalModifiedBy = existing.approval_modified_by;
        approvalModifiedAt = existing.approval_modified_at;
        flagsPreserved++;
      } else {
        const oldFlags = oldFlagsMap.get(bill.id.toString());
        if (oldFlags && (oldFlags.flag_category || oldFlags.approval_status)) {
          flagCategory = oldFlags.flag_category;
          approvalStatus = oldFlags.approval_status;
          approvalModifiedBy = oldFlags.approval_modified_by;
          approvalModifiedAt = oldFlags.approval_modified_at;
          flagsPreserved++;
        }
      }

      // Change detection logging
      if (existing) {
        if (existing.branch !== bill.branch) {
          console.log(`Updating branch: ${existing.branch ?? 'null'} → ${bill.branch ?? 'null'} for netsuite_id: ${netsuiteId}`);
        }
        if (existing.department !== bill.department) {
          console.log(`Updating department: ${existing.department ?? 'null'} → ${bill.department ?? 'null'} for netsuite_id: ${netsuiteId}`);
        }
        recordsUpdated++;
      } else {
        recordsCreated++;
      }

      expenseDataList.push({
        netsuite_id: netsuiteId,
        transaction_date: bill.trandate,
        vendor_name: bill.vendor_name,
        amount: amount,
        currency: bill.currency,
        status: bill.status,
        department: bill.department,
        branch: bill.branch,
        memo: memo,
        category: bill.category,
        transaction_type: 'Vendor Bill',
        cardholder: null,
        flag_category: flagCategory,
        approval_status: approvalStatus,
        approval_modified_by: approvalModifiedBy,
        approval_modified_at: approvalModifiedAt,
        last_synced_at: new Date().toISOString(),
      });
    }

    // Batch upsert to Supabase (with per-record fallback on failure)
    console.log(`Upserting ${expenseDataList.length} records...`);
    const UPSERT_BATCH = 200;
    for (let i = 0; i < expenseDataList.length; i += UPSERT_BATCH) {
      const batch = expenseDataList.slice(i, i + UPSERT_BATCH);
      const { error: batchError } = await supabaseAdmin
        .from('expenses')
        .upsert(batch, {
          onConflict: 'netsuite_id',
          ignoreDuplicates: false,
        });

      if (batchError) {
        console.log(`Batch upsert failed at offset ${i}, falling back to per-record...`);
        for (const item of batch) {
          const { error: itemError } = await supabaseAdmin
            .from('expenses')
            .upsert(item, { onConflict: 'netsuite_id', ignoreDuplicates: false });
          if (itemError) {
            errors.push({
              netsuite_id: item.netsuite_id,
              vendor: item.vendor_name,
              error: itemError.message,
            });
          }
        }
      }
    }

    // Adjust counts for errors
    const errorIds = new Set(errors.map(e => e.netsuite_id));
    for (const eid of errorIds) {
      if (existingMap.has(eid)) {
        recordsUpdated--;
      } else {
        recordsCreated--;
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
