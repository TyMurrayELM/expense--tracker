import { NextResponse } from 'next/server';
import { createBillClient } from '@/lib/bill';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('=== Starting HISTORICAL Credit Card Import ===');
    console.log('Import range: October 1, 2025 to present');
    
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

    // Calculate days back from Oct 1, 2025 to today
    const oct1 = new Date('2025-10-01');
    const today = new Date();
    const daysBack = Math.ceil((today.getTime() - oct1.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`Fetching ALL credit card transactions from Oct 1, 2025 (${daysBack} days back)...`);
    console.log('⚠️  This may take several minutes for large transaction volumes...');
    
    // Fetch transactions by sync status to get complete coverage (same approach as daily sync)
    let allTransactions: Array<{ transaction: any; knownSyncStatus: string | null }> = [];
    
    try {
      // We'll use the historical fetch method but split by sync status for accuracy
      console.log('Fetching SYNCED transactions...');
      const syncedTransactions = await billClient.fetchTransactionsBySyncStatusHistorical(daysBack, 'SYNCED');
      console.log(`Found ${syncedTransactions.length} SYNCED transactions`);
      allTransactions.push(...syncedTransactions.map(t => ({ transaction: t, knownSyncStatus: 'SYNCED' })));
      
      console.log('Fetching MANUAL_SYNCED transactions...');
      const manualSyncedTransactions = await billClient.fetchTransactionsBySyncStatusHistorical(daysBack, 'MANUAL_SYNCED');
      console.log(`Found ${manualSyncedTransactions.length} MANUAL_SYNCED transactions`);
      allTransactions.push(...manualSyncedTransactions.map(t => ({ transaction: t, knownSyncStatus: 'SYNCED' })));
      
      console.log('Fetching NOT_SYNCED transactions...');
      const notSyncedTransactions = await billClient.fetchTransactionsBySyncStatusHistorical(daysBack, 'NOT_SYNCED');
      console.log(`Found ${notSyncedTransactions.length} NOT_SYNCED transactions`);
      allTransactions.push(...notSyncedTransactions.map(t => ({ transaction: t, knownSyncStatus: null })));
      
      console.log('Fetching ERROR transactions...');
      const errorTransactions = await billClient.fetchTransactionsBySyncStatusHistorical(daysBack, 'ERROR');
      console.log(`Found ${errorTransactions.length} ERROR transactions`);
      allTransactions.push(...errorTransactions.map(t => ({ transaction: t, knownSyncStatus: 'ERROR' })));
      
      // Remove duplicates
      const uniqueTransactions = new Map<string, { transaction: any; knownSyncStatus: string | null }>();
      allTransactions.forEach(item => {
        const existingItem = uniqueTransactions.get(item.transaction.id);
        if (!existingItem) {
          uniqueTransactions.set(item.transaction.id, item);
        } else {
          if (item.knownSyncStatus && !existingItem.knownSyncStatus) {
            uniqueTransactions.set(item.transaction.id, item);
          }
        }
      });
      
      allTransactions = Array.from(uniqueTransactions.values());
      console.log(`✓ Total unique transactions after deduplication: ${allTransactions.length}`);
      
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
    
    if (purchaseCategoryUuid) console.log(`✓ Purchase Category field found`);
    if (branchUuid) console.log(`✓ Branch field found`);
    if (departmentUuid) console.log(`✓ Department field found`);

    // PERFORMANCE OPTIMIZATION: Fetch all existing flags in one query
    console.log('Fetching existing flags for preservation...');
    const netsuiteIds = allTransactions.map(t => `BILL-${t.transaction.id}`);
    
    // For large historical imports, batch the flag fetching
    const batchSize = 1000;
    const existingFlagsMap = new Map<string, string | null>();
    
    for (let i = 0; i < netsuiteIds.length; i += batchSize) {
      const batch = netsuiteIds.slice(i, i + batchSize);
      const { data: batchFlags } = await supabaseAdmin
        .from('expenses')
        .select('netsuite_id, flag_category')
        .in('netsuite_id', batch);
      
      (batchFlags || []).forEach(e => {
        existingFlagsMap.set(e.netsuite_id, e.flag_category);
      });
      
      if (i + batchSize < netsuiteIds.length) {
        console.log(`Fetched flags for ${i + batchSize}/${netsuiteIds.length} transactions...`);
      }
    }
    console.log(`Found ${existingFlagsMap.size} existing records with potential flags`);

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

    console.log(`Processing ${allTransactions.length} transactions...`);
    let processedCount = 0;

    // Process each transaction
    for (const { transaction, knownSyncStatus } of allTransactions) {
      processedCount++;
      
      // Log progress every 100 transactions for historical import
      if (processedCount % 100 === 0) {
        console.log(`Progress: ${processedCount}/${allTransactions.length} transactions processed...`);
      }

      try {
        const vendorName = transaction.merchantName || 'Unknown Merchant';
        const cardholderName = userMapping[transaction.userId] || 'Unknown User';
        
        let amount = transaction.amount;
        if (amount > 10000) {
          amount = amount / 100;
        }

        // Get memo from custom fields - leave blank if not provided
        let memo = null;
        if (transaction.customFields && transaction.customFields.length > 0) {
          const descriptionField = transaction.customFields.find((cf: any) => cf.note);
          if (descriptionField && descriptionField.note && descriptionField.note.trim() !== '') {
            memo = descriptionField.note;
          }
        }

        // Get Purchase Category from custom fields - leave blank if not provided
        let category = null;
        if (purchaseCategoryUuid) {
          const purchaseCategory = billClient.extractCustomFieldValue(
            transaction,
            purchaseCategoryUuid
          );
          if (purchaseCategory) {
            category = purchaseCategory;
          }
        }

        let branch = null;
        if (branchUuid) {
          const branchValue = billClient.extractCustomFieldValue(
            transaction,
            branchUuid
          );
          if (branchValue) {
            branch = normalizeBranchName(branchValue);
          }
        }
        if (!branch && transaction.budgetId) {
          const budgetId = transaction.budgetId;
          if (!budgetId.includes('=') && !budgetId.includes('-') && budgetId.length < 50) {
            branch = normalizeBranchName(budgetId);
          }
        }

        let department = null;
        if (departmentUuid) {
          const departmentValue = billClient.extractCustomFieldValue(
            transaction,
            departmentUuid
          );
          if (departmentValue) {
            department = departmentValue;
          }
        }

        const status = transaction.complete ? 'Complete' : 'Incomplete';

        // FLAG PRESERVATION LOGIC: Check if record exists with a manually-set flag
        const netsuiteId = `BILL-${transaction.id}`;
        const existingFlag = existingFlagsMap.get(netsuiteId);
        
        let flagCategory = null;
        if (existingFlag) {
          // Preserve existing flag - user manually set it
          flagCategory = existingFlag;
          flagsPreserved++;
        } else {
          // Only auto-flag new records or records without flags
          if (category && category.toLowerCase().includes('reimburse')) {
            flagCategory = 'Needs Review';
          }
        }

        // Use the known sync status from our filtered queries
        const billSyncStatus = knownSyncStatus;
        
        if (billSyncStatus === 'SYNCED') {
          syncStatusBreakdown['SYNCED']++;
        } else if (billSyncStatus === 'ERROR') {
          syncStatusBreakdown['ERROR']++;
        } else {
          syncStatusBreakdown['NOT_SYNCED']++;
        }

        const expenseData = {
          netsuite_id: netsuiteId,
          transaction_date: transaction.occurredTime.split('T')[0],
          vendor_name: vendorName,
          amount: parseFloat(amount.toString()) || 0,
          currency: 'USD',
          status: status,
          department: department,
          branch: branch,
          memo: memo,
          category: category,
          transaction_type: 'Credit Card',
          cardholder: cardholderName,
          flag_category: flagCategory,
          bill_sync_status: billSyncStatus,
          last_synced_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabaseAdmin
          .from('expenses')
          .upsert(expenseData, {
            onConflict: 'netsuite_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          errors.push({
            transaction_id: transaction.id,
            vendor: vendorName,
            error: upsertError.message,
          });
        } else {
          const { data: existing } = await supabaseAdmin
            .from('expenses')
            .select('created_at, updated_at')
            .eq('netsuite_id', netsuiteId)
            .single();

          if (existing && existing.created_at === existing.updated_at) {
            recordsCreated++;
          } else {
            recordsUpdated++;
          }
        }
      } catch (error: any) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        errors.push({
          transaction_id: transaction.id,
          vendor: transaction.merchantName,
          error: error.message,
        });
      }
    }

    console.log(`✓ Processing complete: ${recordsCreated} created, ${recordsUpdated} updated`);
    console.log('Sync status breakdown:', syncStatusBreakdown);
    console.log(`Flags preserved: ${flagsPreserved}`);

    // Update sync log
    await supabaseAdmin
      .from('sync_logs')
      .update({
        sync_completed_at: new Date().toISOString(),
        records_fetched: allTransactions.length,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        errors: errors.length > 0 ? errors : null,
        status: errors.length === allTransactions.length ? 'failed' : errors.length > 0 ? 'partial' : 'success',
      })
      .eq('id', syncLog.id);

    return NextResponse.json({
      success: true,
      message: `Historical import completed: ${recordsCreated} created, ${recordsUpdated} updated, ${flagsPreserved} flags preserved`,
      stats: {
        fetched: allTransactions.length,
        created: recordsCreated,
        updated: recordsUpdated,
        flagsPreserved: flagsPreserved,
        errors: errors.length,
        dateRange: `Oct 1, 2025 - ${new Date().toLocaleDateString()}`,
        daysImported: daysBack,
        syncStatusBreakdown,
      },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Historical credit card import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}