import { NextResponse } from 'next/server';
import { createBillClient } from '@/lib/bill';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
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

    // Fetch transactions from last 8 days (matching your Google Apps Script)
    // Using shorter timeframe to avoid timeouts
    console.log('Fetching credit card transactions from Bill.com (last 8 days)...');
    
    let transactions;
    try {
      transactions = await billClient.fetchAllTransactions(8, true);
      console.log(`Successfully fetched ${transactions.length} credit card transactions`);
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

    let recordsCreated = 0;
    let recordsUpdated = 0;
    const errors: any[] = [];

    // Helper function to normalize Bill.com branch names to match NetSuite format
    const normalizeBranchName = (branchName: string | null): string | null => {
      if (!branchName) return null;
      
      // Map Bill.com branch names to NetSuite branch names
      const branchMapping: Record<string, string> = {
        'Phoenix:Phx - SouthEast': 'Phoenix - SouthEast',
        'Phoenix:Phx - SouthWest': 'Phoenix - SouthWest',
        'Phoenix:Phx - North': 'Phoenix - North',
        'Las Vegas': 'Las Vegas',
        'Corporate': 'Corporate',
      };
      
      // Check if we have a direct mapping
      if (branchMapping[branchName]) {
        return branchMapping[branchName];
      }
      
      // If not in mapping, try to clean up the format
      // Remove "Phoenix:Phx" prefix and keep the rest
      if (branchName.startsWith('Phoenix:Phx')) {
        return branchName.replace('Phoenix:Phx', 'Phoenix');
      }
      
      // Return as-is if no transformation needed
      return branchName;
    };

    // Process each transaction
    for (const transaction of transactions) {
      try {
        // Get vendor/merchant name
        const vendorName = transaction.merchantName || 'Unknown Merchant';
        
        // Get cardholder name
        const cardholderName = userMapping[transaction.userId] || 'Unknown User';
        
        // Parse amount (Bill.com returns cents, so divide by 100 if needed)
        // Check if amount is already in dollars or cents
        let amount = transaction.amount;
        // If amount is greater than 10000, it's likely in cents
        if (amount > 10000) {
          amount = amount / 100;
        }

        // Get description from custom fields if available
        let memo = null;
        if (transaction.customFields && transaction.customFields.length > 0) {
          const descriptionField = transaction.customFields.find(cf => cf.note);
          if (descriptionField) {
            memo = descriptionField.note;
          }
        }
        
        // Fallback memo with cardholder info
        if (!memo || memo.trim() === '') {
          memo = `Card purchase by ${cardholderName}`;
        }

        // Get Purchase Category from custom fields
        let category = 'Credit Card Purchase'; // Default
        if (purchaseCategoryUuid) {
          const purchaseCategory = billClient.extractCustomFieldValue(
            transaction,
            purchaseCategoryUuid
          );
          if (purchaseCategory) {
            category = purchaseCategory;
          }
        }

        // Get Branch from custom fields
        let branch = null;
        if (branchUuid) {
          const branchValue = billClient.extractCustomFieldValue(
            transaction,
            branchUuid
          );
          if (branchValue) {
            branch = normalizeBranchName(branchValue); // Normalize to match NetSuite format
          }
        }
        // Fallback to budgetId if Branch custom field not set
        // But filter out encoded/incomplete budget IDs (contain '=' or look like base64)
        if (!branch && transaction.budgetId) {
          const budgetId = transaction.budgetId;
          // Check if it looks like an encoded ID (contains = or is base64-like)
          if (!budgetId.includes('=') && !budgetId.includes('-') && budgetId.length < 50) {
            branch = normalizeBranchName(budgetId);
          }
        }

        // Get Department from custom fields
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
          netsuite_id: `BILL-${transaction.id}`, // Prefix to avoid conflicts with NetSuite IDs
          transaction_date: transaction.occurredTime.split('T')[0], // Extract date part
          vendor_name: vendorName,
          amount: parseFloat(amount.toString()) || 0,
          currency: 'USD', // Bill.com typically uses USD
          status: status,
          department: department, // Now from Department custom field
          branch: branch, // Now from Branch custom field
          memo: memo,
          category: category, // Now uses Purchase Category custom field
          transaction_type: 'Credit Card',
          cardholder: cardholderName, // Person who made the purchase
          flag_category: flagCategory, // Auto-flag reimbursements
          last_synced_at: new Date().toISOString(),
        };

        console.log(`Processing: ${cardholderName} - ${vendorName} - $${amount} - Branch: ${branch || 'None'} - Dept: ${department || 'None'} - Category: ${category} - Status: ${status}`);

        // Upsert to Supabase
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
          // Check if it was an insert or update
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
      message: `Credit card sync completed: ${recordsCreated} created, ${recordsUpdated} updated`,
      stats: {
        fetched: transactions.length,
        created: recordsCreated,
        updated: recordsUpdated,
        errors: errors.length,
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
