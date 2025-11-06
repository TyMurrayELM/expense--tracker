'use client';

import { Expense, FLAG_CATEGORIES } from '@/types/expense';
import { format } from 'date-fns';
import { useState } from 'react';

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
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                  No expenses found. Try adjusting your filters or sync data from NetSuite.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr 
                  key={expense.id} 
                  className={`hover:bg-gray-50 ${expense.flag_category ? 'bg-yellow-50' : ''}`}
                >
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
                  <td className="px-3 py-3 text-sm text-gray-900">
                    {formatDate(expense.transaction_date)}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-900 truncate" title={expense.vendor_name}>
                    <div className="flex items-center gap-2">
                      {expense.transaction_type === 'Credit Card' && (
                        <svg 
                          className="w-4 h-4 text-orange-500 flex-shrink-0" 
                          fill="currentColor" 
                          viewBox="0 0 20 20"
                          title="Credit Card Transaction"
                        >
                          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className="truncate">{expense.vendor_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600 truncate" title={expense.cardholder || ''}>
                    {expense.cardholder || '-'}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.category || ''}>
                    {expense.category || '-'}
                  </td>
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
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.department || ''}>
                    {expense.department || '-'}
                  </td>
                  <td className="px-3 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(expense.amount, expense.currency)}
                  </td>
                  <td className="px-3 py-3">
                    {expense.status && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        expense.status === 'Paid' || expense.status === 'Paid In Full' || expense.status === 'Complete' ? 'bg-green-100 text-green-800' :
                        expense.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                        expense.status === 'Incomplete' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {expense.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500 break-words">
                    {expense.memo || '-'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {expense.transaction_type === 'Credit Card' ? (
                      <a
                        href={`https://spend.bill.com/companies/Q29tcGFueToxNDI3OQ==/transactions/pending-and-cleared/${expense.netsuite_id.replace('BILL-', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium"
                        title="View in Bill.com"
                      >
                        View
                      </a>
                    ) : (
                      <a
                        href={`https://system.netsuite.com/app/accounting/transactions/vendbill.nl?id=${expense.netsuite_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium"
                        title="View in NetSuite"
                      >
                        View
                      </a>
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
