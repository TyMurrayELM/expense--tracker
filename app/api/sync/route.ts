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
  // Hoisted so the catch can mark an in-progress sync_log as failed instead of
  // leaving it stuck "running" forever.
  let syncLogId: string | null = null;
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

    // Cheap mutex: refuse to start while another sync is running, so interleaved
    // delete/upsert phases can't clobber each other. "running" rows older than 10
    // minutes are treated as dead (crashed before the catch could mark them).
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: activeSyncs } = await supabaseAdmin
      .from('sync_logs')
      .select('id')
      .eq('status', 'running')
      .gte('sync_started_at', staleCutoff)
      .limit(1);
    if (activeSyncs && activeSyncs.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Another sync is already running. Please wait for it to finish.' },
        { status: 409 }
      );
    }

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

    syncLogId = syncLog.id;
    console.log('Sync log created with ID:', syncLog.id);

    // Initialize NetSuite client
    const nsClient = createNetSuiteClient();

    // Fetch all bill data + expense lines + vendor names in one bulk SuiteQL query
    const fromDate = '2026-04-01';
    console.log('Fetching vendor bills with details from NetSuite...');

    const allBills = await nsClient.searchVendorBillsFull(fromDate);
    const bills = allBills.filter((bill: any) =>
      !bill.category || !EXCLUDED_CATEGORY_PREFIXES.some(prefix => bill.category.startsWith(prefix))
    );
    console.log(`Found ${allBills.length} expense line rows, ${allBills.length - bills.length} excluded by category, ${bills.length} to sync`);

    // Build netsuite_id for each row: {billId}-{lineNumber} or {billId} if no line
    const newNetsuiteIds = bills.map((bill: any) =>
      bill.linesequencenumber != null
        ? `${bill.id}-${bill.linesequencenumber}`
        : bill.id.toString()
    );
    const newIdsSet = new Set(newNetsuiteIds);

    // --- Old-record cleanup: migrate old single-record-per-bill format for Feb+ ---
    // Skip IDs that this sync will reinsert (e.g., a bill with no expense lines whose new id is also bare).
    console.log('Checking for old-format Feb+ records to migrate...');
    // Paginated (PostgREST caps unpaged reads at 1000 rows) and error-checked:
    // a partial read here would delete old-format rows without migrating flags.
    const oldFormatRecords: any[] = [];
    {
      const PAGE = 1000;
      let pageStart = 0;
      while (true) {
        const { data: page, error: pageError } = await supabaseAdmin
          .from('expenses')
          .select('netsuite_id, flag_category, approval_status, approval_modified_by, approval_modified_at')
          .eq('transaction_type', 'Vendor Bill')
          .gte('transaction_date', '2026-04-01')
          .not('netsuite_id', 'like', '%-%')
          .order('netsuite_id')
          .range(pageStart, pageStart + PAGE - 1);
        if (pageError) {
          throw new Error(`Failed to fetch old-format records for migration: ${pageError.message}`);
        }
        oldFormatRecords.push(...(page || []));
        if (!page || page.length < PAGE) break;
        pageStart += PAGE;
      }
    }

    const oldFlagsMap = new Map<string, any>();
    const oldToDelete = (oldFormatRecords || []).filter(r => !newIdsSet.has(r.netsuite_id));
    if (oldToDelete.length > 0) {
      for (const rec of oldToDelete) {
        oldFlagsMap.set(rec.netsuite_id, {
          flag_category: rec.flag_category,
          approval_status: rec.approval_status,
          approval_modified_by: rec.approval_modified_by,
          approval_modified_at: rec.approval_modified_at,
        });
      }
      console.log(`Found ${oldToDelete.length} old-format records, deleting...`);
      const oldIds = oldToDelete.map(r => r.netsuite_id);
      for (let i = 0; i < oldIds.length; i += 500) {
        const batch = oldIds.slice(i, i + 500);
        await supabaseAdmin.from('expenses').delete().in('netsuite_id', batch);
      }
      console.log(`Deleted ${oldIds.length} old-format records (flags saved for migration)`);
    } else {
      console.log('No old-format records to migrate');
    }

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

    // Build expense data array.
    //
    // Only sync-owned columns are written for existing rows. Manual columns
    // (flag_category, approval_*) are omitted from their upsert payload so the
    // DB keeps whatever value is there — including edits made while this sync
    // is running, which the old read-snapshot/write-back approach would
    // silently revert. New rows DO carry the flag/approval fields, since the
    // old-format migration (oldFlagsMap) re-creates flags under the new
    // {billId}-{line} ids. New and existing rows are upserted separately since
    // PostgREST requires uniform keys within a batch.
    const newRows: any[] = [];
    const existingRows: any[] = [];

    for (const bill of bills) {
      const netsuiteId = bill.linesequencenumber != null
        ? `${bill.id}-${bill.linesequencenumber}`
        : bill.id.toString();
      const existing = existingMap.get(netsuiteId);
      const memo = bill.line_memo || bill.header_memo || bill.tranid || null;
      const amount = bill.line_amount != null ? bill.line_amount : bill.bill_total;

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

      const row: any = {
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
        last_synced_at: new Date().toISOString(),
      };

      if (existing) {
        if (existing.flag_category || existing.approval_status) flagsPreserved++;
        existingRows.push(row);
      } else {
        // Migrate flags from a just-deleted old-format bill record, if any
        const oldFlags = oldFlagsMap.get(bill.id.toString());
        row.flag_category = oldFlags?.flag_category ?? null;
        row.approval_status = oldFlags?.approval_status ?? null;
        row.approval_modified_by = oldFlags?.approval_modified_by ?? null;
        row.approval_modified_at = oldFlags?.approval_modified_at ?? null;
        if (oldFlags && (oldFlags.flag_category || oldFlags.approval_status)) flagsPreserved++;
        newRows.push(row);
      }
    }

    // Batch upsert to Supabase (with per-record fallback on failure)
    console.log(`Upserting ${newRows.length + existingRows.length} records (${newRows.length} new, ${existingRows.length} existing)...`);
    const UPSERT_BATCH = 200;
    const upsertBatches = async (rows: any[]) => {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const batch = rows.slice(i, i + UPSERT_BATCH);
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
    };
    await upsertBatches(newRows);
    await upsertBatches(existingRows);

    // Adjust counts for errors
    const errorIds = new Set(errors.map(e => e.netsuite_id));
    for (const eid of errorIds) {
      if (existingMap.has(eid)) {
        recordsUpdated--;
      } else {
        recordsCreated--;
      }
    }

    // --- Delete stragglers: vendor bills in Supabase (in date range) no longer in NetSuite ---
    // Safety: skip cleanup if NetSuite returned nothing (likely a transient error, not "all bills deleted")
    let recordsDeleted = 0;
    if (allBills.length === 0) {
      console.log('Skipping straggler cleanup — NetSuite returned 0 bills (likely transient error)');
    } else {
    console.log('Checking for deleted/stale vendor bills to remove...');
    const returnedIds = new Set(newNetsuiteIds);
    const allDbIds: string[] = [];
    let pageStart = 0;
    const PAGE = 1000;
    while (true) {
      const { data: page, error: pageError } = await supabaseAdmin
        .from('expenses')
        .select('netsuite_id')
        .eq('transaction_type', 'Vendor Bill')
        .gte('transaction_date', fromDate)
        .range(pageStart, pageStart + PAGE - 1);
      if (pageError) {
        console.error('Failed to fetch existing db ids for cleanup:', pageError.message);
        break;
      }
      if (!page || page.length === 0) break;
      allDbIds.push(...page.map(r => r.netsuite_id));
      if (page.length < PAGE) break;
      pageStart += PAGE;
    }

    const stragglers = allDbIds.filter(id => !returnedIds.has(id));
    if (stragglers.length > 0) {
      console.log(`Found ${stragglers.length} stragglers to delete (no longer in NetSuite)`);
      for (let i = 0; i < stragglers.length; i += 500) {
        const batch = stragglers.slice(i, i + 500);
        const { error: deleteError } = await supabaseAdmin
          .from('expenses')
          .delete()
          .in('netsuite_id', batch);
        if (deleteError) {
          console.error(`Failed to delete straggler batch at offset ${i}:`, deleteError.message);
        } else {
          recordsDeleted += batch.length;
        }
      }
      console.log(`Deleted ${recordsDeleted} stale records`);
    } else {
      console.log('No stragglers to delete');
    }
    }

    console.log(`✓ Processing complete: ${recordsCreated} created, ${recordsUpdated} updated, ${recordsDeleted} deleted`);
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
        status: bills.length > 0 && errors.length === bills.length ? 'failed' : errors.length > 0 ? 'partial' : 'success',
      })
      .eq('id', syncLog.id);

    return NextResponse.json({
      success: true,
      message: `Vendor bill sync completed: ${recordsCreated} created, ${recordsUpdated} updated, ${recordsDeleted} deleted, ${flagsPreserved} flags preserved`,
      stats: {
        fetched: bills.length,
        created: recordsCreated,
        updated: recordsUpdated,
        deleted: recordsDeleted,
        flagsPreserved: flagsPreserved,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Vendor bill sync error:', error);

    // Don't leave the sync_log stuck "running" if we threw partway through.
    if (syncLogId) {
      await supabaseAdmin
        .from('sync_logs')
        .update({
          status: 'failed',
          sync_completed_at: new Date().toISOString(),
          errors: [error?.message || 'Unknown error'],
        })
        .eq('id', syncLogId);
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
