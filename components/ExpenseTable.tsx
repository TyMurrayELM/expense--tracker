'use client';

import { Expense, FLAG_CATEGORIES } from '@/types/expense';
import { format } from 'date-fns';
import { useState } from 'react';
import Image from 'next/image';
import SlackNotifyButton from './SlackNotifyButton';

interface ExpenseTableProps {
  expenses: Expense[];
  onFlagUpdate?: (expenseId: string, newFlagCategory: string | null) => void;
}

export default function ExpenseTable({ expenses, onFlagUpdate }: ExpenseTableProps) {
  const [updatingFlags, setUpdatingFlags] = useState<Set<string>>(new Set());

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    // Map full currency names to codes
    const currencyMap: Record<string, string> = {
      'US Dollar': 'USD',
      'Euro': 'EUR',
      'British Pound': 'GBP',
      'Canadian Dollar': 'CAD',
      'Mexican Peso': 'MXN',
      'Japanese Yen': 'JPY',
    };
    
    const currencyCode = currencyMap[currency] || currency;
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  // Generate transaction URL based on type
  const getTransactionUrl = (expense: Expense) => {
    if (expense.transaction_type === 'Credit Card') {
      // Bill.com URL
      const billId = expense.netsuite_id.replace('BILL-', '');
      return `https://spend.bill.com/companies/Q29tcGFueToxNDI3OQ==/transactions/pending-and-cleared/${billId}`;
    } else {
      // NetSuite URL
      return `https://system.netsuite.com/app/accounting/transactions/vendbill.nl?id=${expense.netsuite_id}`;
    }
  };

  const handleFlagChange = async (expenseId: string, flagCategory: string | null) => {
    setUpdatingFlags(prev => new Set(prev).add(expenseId));

    try {
      const response = await fetch('/api/expenses/flag', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenseId,
          flagCategory: flagCategory === '' ? null : flagCategory,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Trigger a refresh of the data with the new flag
        if (onFlagUpdate) {
          onFlagUpdate(expenseId, flagCategory === '' ? null : flagCategory);
        }
      } else {
        console.error('Failed to update flag:', data.error);
        alert('Failed to update flag. Please try again.');
      }
    } catch (error) {
      console.error('Error updating flag:', error);
      alert('Error updating flag. Please try again.');
    } finally {
      setUpdatingFlags(prev => {
        const next = new Set(prev);
        next.delete(expenseId);
        return next;
      });
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-[calc(100vh-400px)] overflow-y-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '70px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '60px' }} />
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Flag
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Date
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Vendor
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Purchaser
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Category
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Branch
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Department
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Amount
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Memo
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                View
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Notify
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                  No expenses found. Try adjusting your filters or sync data from NetSuite.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr 
                  key={expense.id} 
                  className={`hover:bg-gray-50 ${expense.flag_category ? 'bg-yellow-50' : ''}`}
                >
                  {/* Flag Column */}
                  <td className="px-3 py-3">
                    <select
                      value={expense.flag_category || ''}
                      onChange={(e) => handleFlagChange(expense.id, e.target.value)}
                      disabled={updatingFlags.has(expense.id)}
                      className={`text-xs border rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        expense.flag_category 
                          ? 'border-yellow-400 bg-yellow-100 text-yellow-900 font-medium' 
                          : 'border-gray-300 bg-white text-gray-700'
                      } ${updatingFlags.has(expense.id) ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                    >
                      <option value="">No Flag</option>
                      {FLAG_CATEGORIES.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Date Column */}
                  <td className="px-3 py-3 text-sm text-gray-900">
                    {formatDate(expense.transaction_date)}
                  </td>

                  {/* Vendor Column */}
                  <td className="px-3 py-3 text-sm text-gray-900 truncate" title={expense.vendor_name}>
                    <div className="flex items-center gap-2">
                      {expense.transaction_type === 'Credit Card' ? (
                        <Image
                          src="/logos/bill.png"
                          alt="Bill.com Credit Card"
                          width={16}
                          height={16}
                          className="flex-shrink-0"
                          title="Credit Card Transaction"
                        />
                      ) : (
                        <Image
                          src="/logos/netsuite.png"
                          alt="NetSuite Vendor Bill"
                          width={16}
                          height={16}
                          className="flex-shrink-0"
                          title="Vendor Bill"
                        />
                      )}
                      <span className="truncate">{expense.vendor_name}</span>
                    </div>
                  </td>

                  {/* Purchaser Column */}
                  <td className="px-3 py-3 text-sm text-gray-600 truncate" title={expense.cardholder || ''}>
                    {expense.cardholder || '-'}
                  </td>

                  {/* Category Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.category || ''}>
                    {expense.category || '-'}
                  </td>

                  {/* Branch Column */}
                  <td className="px-3 py-3">
                    {expense.branch && expense.branch !== 'QnVkZ2V0OjcyNDQ0MQ==-' && !expense.branch.includes('=') && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        expense.branch === 'Phoenix - North' ? 'bg-green-100 text-green-800' :
                        expense.branch === 'Phoenix - SouthEast' ? 'bg-red-100 text-red-800' :
                        expense.branch === 'Phoenix - SouthWest' ? 'bg-blue-100 text-blue-800' :
                        expense.branch === 'Las Vegas' ? 'bg-yellow-100 text-yellow-800' :
                        expense.branch === 'Corporate' ? 'bg-gray-100 text-gray-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {expense.branch}
                      </span>
                    )}
                  </td>

                  {/* Department Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.department || ''}>
                    {expense.department || '-'}
                  </td>

                  {/* Amount Column */}
                  <td className="px-3 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(expense.amount, expense.currency)}
                  </td>

                  {/* Status Column */}
                  <td className="px-3 py-3">
                    {expense.status && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        expense.status === 'Paid' || expense.status === 'Paid In Full' || expense.status === 'Complete' ? 'bg-green-100 text-green-800' :
                        expense.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                        expense.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {expense.status}
                      </span>
                    )}
                  </td>

                  {/* Memo Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.memo || ''}>
                    {expense.memo || '-'}
                  </td>

                  {/* View Column */}
                  <td className="px-3 py-3 text-center">
                    <a
                      href={getTransactionUrl(expense)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 inline-block"
                      title={expense.transaction_type === 'Credit Card' ? 'View in Bill.com' : 'View in NetSuite'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </td>

                  {/* Slack Notify Column */}
                  <td className="px-3 py-3 text-center">
                    {expense.cardholder && (
                      <SlackNotifyButton
                        expenseId={expense.id}
                        netsuiteId={expense.netsuite_id}
                        transactionType={expense.transaction_type}
                        purchaserName={expense.cardholder}
                        vendor={expense.vendor_name}
                        amount={expense.amount}
                        date={expense.transaction_date}
                        memo={expense.memo}
                        currentBranch={expense.branch}
                        currentDepartment={expense.department}
                        currentCategory={expense.category}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}