import { NextResponse } from 'next/server';
import { createBillClient } from '@/lib/bill';
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

    console.log('=== Starting Credit Card Sync ===');
    
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

    // Initialize Bill.com client
    const billClient = createBillClient();
    console.log('Bill.com client initialized');

    // Fetch transactions by sync status to get complete coverage
    console.log('Fetching credit card transactions from Bill.com (last 14 days) by sync status...');
    
    let allTransactions: Array<{ transaction: any; knownSyncStatus: string | null }> = [];
    
    try {
      // Fetch SYNCED transactions
      console.log('Fetching SYNCED transactions...');
      const syncedTransactions = await billClient.fetchTransactionsBySyncStatus(14, 'SYNCED', true);
      console.log(`Found ${syncedTransactions.length} SYNCED transactions`);
      allTransactions.push(...syncedTransactions.map(t => ({ transaction: t, knownSyncStatus: 'SYNCED' })));
      
      // Fetch MANUAL_SYNCED transactions
      console.log('Fetching MANUAL_SYNCED transactions...');
      const manualSyncedTransactions = await billClient.fetchTransactionsBySyncStatus(14, 'MANUAL_SYNCED', true);
      console.log(`Found ${manualSyncedTransactions.length} MANUAL_SYNCED transactions`);
      allTransactions.push(...manualSyncedTransactions.map(t => ({ transaction: t, knownSyncStatus: 'SYNCED' })));
      
      // Fetch NOT_SYNCED transactions
      console.log('Fetching NOT_SYNCED transactions...');
      const notSyncedTransactions = await billClient.fetchTransactionsBySyncStatus(14, 'NOT_SYNCED', true);
      console.log(`Found ${notSyncedTransactions.length} NOT_SYNCED transactions`);
      allTransactions.push(...notSyncedTransactions.map(t => ({ transaction: t, knownSyncStatus: null })));
      
      // Fetch ERROR transactions
      console.log('Fetching ERROR transactions...');
      const errorTransactions = await billClient.fetchTransactionsBySyncStatus(14, 'ERROR', true);
      console.log(`Found ${errorTransactions.length} ERROR transactions`);
      allTransactions.push(...errorTransactions.map(t => ({ transaction: t, knownSyncStatus: 'ERROR' })));
      
      // Remove duplicates (same transaction might appear in multiple queries)
      const uniqueTransactions = new Map<string, { transaction: any; knownSyncStatus: string | null }>();
      allTransactions.forEach(item => {
        const existingItem = uniqueTransactions.get(item.transaction.id);
        if (!existingItem) {
          uniqueTransactions.set(item.transaction.id, item);
        } else {
          // If duplicate, prefer the one with a sync status (SYNCED or ERROR over null)
          if (item.knownSyncStatus && !existingItem.knownSyncStatus) {
            uniqueTransactions.set(item.transaction.id, item);
          }
        }
      });
      
      allTransactions = Array.from(uniqueTransactions.values());
      console.log(`Total unique transactions after deduplication: ${allTransactions.length}`);
      
    } catch (fetchError: any) {
      console.error('Error fetching transactions:', fetchError.message);
      
      // Update sync log with error
      await supabaseAdmin
        .from('sync_logs')
        .update({
          sync_completed_at: new Date().toISOString(),
          status: 'failed',
          errors: [{ error: fetchError.message }],
        })
        .eq('id', syncLog.id);
      
      throw new Error(`Failed to fetch transactions from Bill.com: ${fetchError.message}`);
    }

    // Get user name mapping
    console.log('Fetching user mappings...');
    const userMapping = await billClient.getUserNameMapping();
    console.log(`Loaded ${Object.keys(userMapping).length} user mappings`);

    // Get custom field UUIDs
    console.log('Fetching custom fields...');
    const purchaseCategoryUuid = await billClient.getCustomFieldUuidByName('Purchase Category');
    const branchUuid = await billClient.getCustomFieldUuidByName('Branch');
    const departmentUuid = await billClient.getCustomFieldUuidByName('Department');
    
    if (purchaseCategoryUuid) {
      console.log(`Purchase Category field found: ${purchaseCategoryUuid}`);
    } else {
      console.log('Purchase Category custom field not found - will use generic category');
    }
    
    if (branchUuid) {
      console.log(`Branch field found: ${branchUuid}`);
    } else {
      console.log('Branch custom field not found');
    }
    
    if (departmentUuid) {
      console.log(`Department field found: ${departmentUuid}`);
    } else {
      console.log('Department custom field not found');
    }

    // Batch the existing-record fetching to avoid connection issues with large queries.
    // Map holds the full set of fields we preserve across syncs (flag + approval state).
    console.log('Fetching existing records for flag/approval preservation and change detection...');
    const netsuiteIds = allTransactions.map(t => `BILL-${t.transaction.id}`);
    console.log(`Built ${netsuiteIds.length} NetSuite IDs to check`);

    interface PreservedFields {
      flag_category: string | null;
      approval_status: string | null;
      approval_modified_by: string | null;
      approval_modified_at: string | null;
    }
    const batchSize = 100;
    const existingMap = new Map<string, PreservedFields>();

    for (let i = 0; i < netsuiteIds.length; i += batchSize) {
      const batch = netsuiteIds.slice(i, i + batchSize);

      try {
        const { data: batchRows, error: fetchError } = await supabaseAdmin
          .from('expenses')
          .select('netsuite_id, flag_category, approval_status, approval_modified_by, approval_modified_at')
          .in('netsuite_id', batch);

        if (fetchError) {
          console.error(`Error fetching batch ${Math.floor(i / batchSize) + 1}:`, fetchError);
        } else {
          (batchRows || []).forEach(e => {
            existingMap.set(e.netsuite_id, {
              flag_category: e.flag_category,
              approval_status: e.approval_status,
              approval_modified_by: e.approval_modified_by,
              approval_modified_at: e.approval_modified_at,
            });
          });
        }
      } catch (batchError: any) {
        console.error(`Exception in batch ${Math.floor(i / batchSize) + 1}:`, batchError.message);
      }
    }

    console.log(`Loaded ${existingMap.size} existing records into map`);
    const recordsWithActualFlags = Array.from(existingMap.values()).filter(v => v.flag_category !== null).length;
    console.log(`Records with non-null flags: ${recordsWithActualFlags}`);

    let recordsCreated = 0;
    let recordsUpdated = 0;
    let flagsPreserved = 0;
    const errors: any[] = [];
    
    // Track sync status statistics
    const syncStatusBreakdown: Record<string, number> = {
      'SYNCED': 0,
      'NOT_SYNCED': 0,
      'ERROR': 0,
    };

    // Helper function to normalize Bill.com branch names to match NetSuite format
    const normalizeBranchName = (branchName: string | null): string | null => {
      if (!branchName) return null;
      
      const branchMapping: Record<string, string> = {
        'Phoenix:Phx - SouthEast': 'Phoenix - SouthEast',
        'Phoenix:Phx - SouthWest': 'Phoenix - SouthWest',
        'Phoenix:Phx - North': 'Phoenix - North',
        'Las Vegas': 'Las Vegas',
        'Corporate': 'Corporate',
      };
      
      if (branchMapping[branchName]) {
        return branchMapping[branchName];
      }
      
      if (branchName.startsWith('Phoenix:Phx')) {
        return branchName.replace('Phoenix:Phx', 'Phoenix');
      }
      
      return branchName;
    };

    // Build expense data + tally created/updated/preserved counts.
    // We track the netsuite_id on each row so we can decrement counts for upsert failures below.
    interface ExpenseRow {
      netsuite_id: string;
      transaction_date: string;
      vendor_name: string;
      amount: number;
      currency: string;
      status: string;
      department: string | null;
      branch: string | null;
      memo: string | null;
      category: string | null;
      transaction_type: string;
      cardholder: string;
      flag_category: string | null;
      approval_status: string | null;
      approval_modified_by: string | null;
      approval_modified_at: string | null;
      bill_sync_status: string | null;
      last_synced_at: string;
    }
    const expenseDataList: ExpenseRow[] = [];

    for (const { transaction, knownSyncStatus } of allTransactions) {
      try {
        const vendorName = transaction.merchantName || 'Unknown Merchant';
        const cardholderName = userMapping[transaction.userId] || 'Unknown User';

        const amount = transaction.amount;
        if (amount > 10000) {
          console.warn(`Large transaction amount $${amount} for ${vendorName} (id ${transaction.id}) — verify Bill.com is returning dollars, not cents`);
        }

        let memo = null;
        if (transaction.customFields && transaction.customFields.length > 0) {
          const descriptionField = transaction.customFields.find((cf: any) => cf.note);
          if (descriptionField && descriptionField.note && descriptionField.note.trim() !== '') {
            memo = descriptionField.note;
          }
        }

        let category = null;
        if (purchaseCategoryUuid) {
          const purchaseCategory = billClient.extractCustomFieldValue(transaction, purchaseCategoryUuid);
          if (purchaseCategory) category = purchaseCategory;
        }

        let branch = null;
        if (branchUuid) {
          const branchValue = billClient.extractCustomFieldValue(transaction, branchUuid);
          if (branchValue) branch = normalizeBranchName(branchValue);
        }
        if (!branch && transaction.budgetId) {
          const budgetId = transaction.budgetId;
          if (!budgetId.includes('=') && !budgetId.includes('-') && budgetId.length < 50) {
            branch = normalizeBranchName(budgetId);
          }
        }

        let department = null;
        if (departmentUuid) {
          const departmentValue = billClient.extractCustomFieldValue(transaction, departmentUuid);
          if (departmentValue) department = departmentValue;
        }

        const status = transaction.complete ? 'Complete' : 'Incomplete';

        const netsuiteId = `BILL-${transaction.id}`;
        const existing = existingMap.get(netsuiteId);

        let flagCategory: string | null = null;
        let approvalStatus: string | null = null;
        let approvalModifiedBy: string | null = null;
        let approvalModifiedAt: string | null = null;

        if (existing) {
          flagCategory = existing.flag_category;
          approvalStatus = existing.approval_status;
          approvalModifiedBy = existing.approval_modified_by;
          approvalModifiedAt = existing.approval_modified_at;
          if (existing.flag_category || existing.approval_status) flagsPreserved++;
        } else if (category && category.toLowerCase().includes('reimburse')) {
          flagCategory = 'Needs Review';
        }

        const billSyncStatus = knownSyncStatus;
        if (billSyncStatus === 'SYNCED') syncStatusBreakdown['SYNCED']++;
        else if (billSyncStatus === 'ERROR') syncStatusBreakdown['ERROR']++;
        else syncStatusBreakdown['NOT_SYNCED']++;

        if (existing) recordsUpdated++;
        else recordsCreated++;

        expenseDataList.push({
          netsuite_id: netsuiteId,
          transaction_date: transaction.occurredTime.split('T')[0],
          vendor_name: vendorName,
          amount: parseFloat(amount.toString()) || 0,
          currency: 'USD',
          status,
          department,
          branch,
          memo,
          category,
          transaction_type: 'Credit Card',
          cardholder: cardholderName,
          flag_category: flagCategory,
          approval_status: approvalStatus,
          approval_modified_by: approvalModifiedBy,
          approval_modified_at: approvalModifiedAt,
          bill_sync_status: billSyncStatus,
          last_synced_at: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        errors.push({
          netsuite_id: `BILL-${transaction.id}`,
          transaction_id: transaction.id,
          vendor: transaction.merchantName,
          error: error.message,
        });
      }
    }

    // Batch upsert (with per-record fallback on failure)
    console.log(`Upserting ${expenseDataList.length} records...`);
    const UPSERT_BATCH = 200;
    for (let i = 0; i < expenseDataList.length; i += UPSERT_BATCH) {
      const batch = expenseDataList.slice(i, i + UPSERT_BATCH);
      const { error: batchError } = await supabaseAdmin
        .from('expenses')
        .upsert(batch, { onConflict: 'netsuite_id', ignoreDuplicates: false });

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

    // Decrement created/updated for any rows that failed to persist
    const errorIds = new Set(errors.map(e => e.netsuite_id).filter(Boolean));
    for (const eid of errorIds) {
      if (existingMap.has(eid)) recordsUpdated--;
      else recordsCreated--;
    }

    console.log('=== SYNC STATUS STATISTICS ===');
    console.log('Sync status breakdown:', syncStatusBreakdown);
    console.log(`Flags preserved: ${flagsPreserved}`);
    console.log('=== END STATISTICS ===');

    await supabaseAdmin
      .from('sync_logs')
      .update({
        sync_completed_at: new Date().toISOString(),
        records_fetched: allTransactions.length,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        errors: errors.length > 0 ? errors : null,
        status: allTransactions.length > 0 && errors.length === allTransactions.length ? 'failed' : errors.length > 0 ? 'partial' : 'success',
      })
      .eq('id', syncLog.id);

    return NextResponse.json({
      success: true,
      message: `Credit card sync completed: ${recordsCreated} created, ${recordsUpdated} updated, ${flagsPreserved} flags preserved`,
      stats: {
        fetched: allTransactions.length,
        created: recordsCreated,
        updated: recordsUpdated,
        flagsPreserved: flagsPreserved,
        errors: errors.length,
        syncStatusBreakdown,
      },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Credit card sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}