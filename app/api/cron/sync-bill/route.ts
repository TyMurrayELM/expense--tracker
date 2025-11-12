import { NextResponse } from 'next/server';
import { createBillClient } from '@/lib/bill';
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

    console.log('=== CRON: Starting Automated Credit Card Sync ===');
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

    // Initialize Bill.com client
    const billClient = createBillClient();
    console.log('Bill.com client initialized');

    // Fetch transactions by sync status to get complete coverage
    console.log('Fetching credit card transactions from Bill.com (last 8 days) by sync status...');
    
    let allTransactions: Array<{ transaction: any; knownSyncStatus: string | null }> = [];
    
    try {
      // Fetch SYNCED transactions
      console.log('Fetching SYNCED transactions...');
      const syncedTransactions = await billClient.fetchTransactionsBySyncStatus(8, 'SYNCED', true);
      console.log(`Found ${syncedTransactions.length} SYNCED transactions`);
      allTransactions.push(...syncedTransactions.map(t => ({ transaction: t, knownSyncStatus: 'SYNCED' })));
      
      // Fetch MANUAL_SYNCED transactions
      console.log('Fetching MANUAL_SYNCED transactions...');
      const manualSyncedTransactions = await billClient.fetchTransactionsBySyncStatus(8, 'MANUAL_SYNCED', true);
      console.log(`Found ${manualSyncedTransactions.length} MANUAL_SYNCED transactions`);
      allTransactions.push(...manualSyncedTransactions.map(t => ({ transaction: t, knownSyncStatus: 'SYNCED' })));
      
      // Fetch NOT_SYNCED transactions
      console.log('Fetching NOT_SYNCED transactions...');
      const notSyncedTransactions = await billClient.fetchTransactionsBySyncStatus(8, 'NOT_SYNCED', true);
      console.log(`Found ${notSyncedTransactions.length} NOT_SYNCED transactions`);
      allTransactions.push(...notSyncedTransactions.map(t => ({ transaction: t, knownSyncStatus: null })));
      
      // Fetch ERROR transactions
      console.log('Fetching ERROR transactions...');
      const errorTransactions = await billClient.fetchTransactionsBySyncStatus(8, 'ERROR', true);
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
      console.log(`Total unique transactions after deduplication: ${allTransactions.length}`);
      
    } catch (fetchError: any) {
      console.error('Error fetching transactions:', fetchError.message);
      
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
    
    console.log('Custom field UUIDs:', { purchaseCategoryUuid, branchUuid, departmentUuid });

    // PERFORMANCE OPTIMIZATION: Fetch all existing flags in one query
    console.log('Fetching existing flags for preservation...');
    const billIds = allTransactions.map(item => `BILL-${item.transaction.id}`);
    const { data: existingFlags } = await supabaseAdmin
      .from('expenses')
      .select('netsuite_id, flag_category')
      .in('netsuite_id', billIds);
    
    const existingFlagsMap = new Map(
      (existingFlags || []).map(e => [e.netsuite_id, e.flag_category])
    );
    console.log(`Found ${existingFlagsMap.size} existing records with potential flags`);

    let recordsCreated = 0;
    let recordsUpdated = 0;
    let flagsPreserved = 0;
    const errors: any[] = [];

    // Process each transaction
    for (const { transaction, knownSyncStatus } of allTransactions) {
      try {
        const netsuiteId = `BILL-${transaction.id}`;
        const userName = userMapping[transaction.userId] || 'Unknown User';
        
        // Determine sync status
        let syncStatus = 'Not Synced';
        const integrationTx = transaction.accountingIntegrationTransactions?.[0];
        
        if (knownSyncStatus === 'SYNCED') {
          syncStatus = 'Synced';
        } else if (knownSyncStatus === 'ERROR') {
          syncStatus = 'Error';
        } else if (integrationTx) {
          if (integrationTx.syncStatus === 'SYNCED' || integrationTx.syncStatus === 'MANUAL_SYNCED') {
            syncStatus = 'Synced';
          } else if (integrationTx.syncStatus === 'ERROR') {
            syncStatus = 'Error';
          }
        }

        // Extract custom fields
        let category = null;
        let branch = null;
        let department = null;

        if (transaction.customFields) {
          for (const field of transaction.customFields) {
            if (field.uuid === purchaseCategoryUuid || field.customFieldUuid === purchaseCategoryUuid) {
              category = field.selectedValues?.[0]?.value || null;
            } else if (field.uuid === branchUuid || field.customFieldUuid === branchUuid) {
              branch = field.selectedValues?.[0]?.value || null;
            } else if (field.uuid === departmentUuid || field.customFieldUuid === departmentUuid) {
              department = field.selectedValues?.[0]?.value || null;
            }
          }
        }

        // Determine flag category - PRESERVE existing flag if it exists
        const existingFlag = existingFlagsMap.get(netsuiteId);
        let flagCategory = existingFlag || null;
        
        if (existingFlag) {
          flagsPreserved++;
        }

        const expenseData = {
          netsuite_id: netsuiteId,
          vendor: transaction.merchantName,
          date: new Date(transaction.occurredTime).toISOString().split('T')[0],
          amount: transaction.amount,
          memo: transaction.customFields?.find((f: any) => f.note)?.note || null,
          branch,
          department,
          category,
          cardholder: userName,
          transaction_type: 'Credit Card',
          sync_status: syncStatus,
          flag_category: flagCategory,
          last_synced_at: new Date().toISOString(),
        };

        console.log(`Processing: ${transaction.merchantName} - $${transaction.amount} - ${branch || 'No Branch'}`);

        const { data: existingRecord } = await supabaseAdmin
          .from('expenses')
          .select('netsuite_id')
          .eq('netsuite_id', netsuiteId)
          .single();

        const isNewRecord = !existingRecord;

        const { error: upsertError } = await supabaseAdmin
          .from('expenses')
          .upsert(expenseData, {
            onConflict: 'netsuite_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          errors.push({
            netsuite_id: netsuiteId,
            vendor: transaction.merchantName,
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
        console.error(`Error processing transaction ${transaction.id}:`, error);
        errors.push({
          netsuite_id: `BILL-${transaction.id}`,
          vendor: transaction.merchantName,
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
        records_fetched: allTransactions.length,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        errors: errors.length > 0 ? errors : null,
        status: errors.length === allTransactions.length ? 'failed' : errors.length > 0 ? 'partial' : 'success',
      })
      .eq('id', syncLog.id);

    console.log('=== CRON: Credit Card Sync Completed Successfully ===');

    return NextResponse.json({
      success: true,
      message: `Credit card sync completed: ${recordsCreated} created, ${recordsUpdated} updated, ${flagsPreserved} flags preserved`,
      stats: {
        fetched: allTransactions.length,
        created: recordsCreated,
        updated: recordsUpdated,
        flagsPreserved: flagsPreserved,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('=== CRON: Credit Card Sync Error ===');
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