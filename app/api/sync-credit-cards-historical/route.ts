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
    
    let transactions;
    try {
      // Fetch with custom date range - this will use more pages if needed
      transactions = await billClient.fetchAllTransactionsHistorical(daysBack);
      console.log(`✓ Successfully fetched ${transactions.length} credit card transactions`);
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

    let recordsCreated = 0;
    let recordsUpdated = 0;
    const errors: any[] = [];

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

    console.log(`Processing ${transactions.length} transactions...`);
    let processedCount = 0;

    // Process each transaction
    for (const transaction of transactions) {
      processedCount++;
      
      // Log progress every 50 transactions
      if (processedCount % 50 === 0) {
        console.log(`Progress: ${processedCount}/${transactions.length} transactions processed...`);
      }

      try {
        const vendorName = transaction.merchantName || 'Unknown Merchant';
        const cardholderName = userMapping[transaction.userId] || 'Unknown User';
        
        let amount = transaction.amount;
        if (amount > 10000) {
          amount = amount / 100;
        }

        let memo = null;
        if (transaction.customFields && transaction.customFields.length > 0) {
          const descriptionField = transaction.customFields.find(cf => cf.note);
          if (descriptionField) {
            memo = descriptionField.note;
          }
        }
        
        if (!memo || memo.trim() === '') {
          memo = `Card purchase by ${cardholderName}`;
        }

        let category = 'Credit Card Purchase';
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

        // Use the 'complete' field from Bill.com API for status
        const status = transaction.complete ? 'Complete' : 'Incomplete';

        // Auto-flag reimbursements
        let flagCategory = null;
        if (category && category.toLowerCase().includes('reimburse')) {
          flagCategory = 'Needs Review';
        }

        const expenseData = {
          netsuite_id: `BILL-${transaction.id}`,
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
          flag_category: flagCategory, // Auto-flag reimbursements
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
            .eq('netsuite_id', `BILL-${transaction.id}`)
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

    // Update sync log
    await supabaseAdmin
      .from('sync_logs')
      .update({
        sync_completed_at: new Date().toISOString(),
        records_fetched: transactions.length,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        errors: errors.length > 0 ? errors : null,
        status: errors.length === transactions.length ? 'failed' : errors.length > 0 ? 'partial' : 'success',
      })
      .eq('id', syncLog.id);

    return NextResponse.json({
      success: true,
      message: `Historical import completed: ${recordsCreated} created, ${recordsUpdated} updated`,
      stats: {
        fetched: transactions.length,
        created: recordsCreated,
        updated: recordsUpdated,
        errors: errors.length,
        dateRange: `Oct 1, 2025 - ${new Date().toLocaleDateString()}`,
        daysImported: daysBack,
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
