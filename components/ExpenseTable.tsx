'use client';

import { Expense, FLAG_CATEGORIES } from '@/types/expense';
import { format } from 'date-fns';
import { useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import SlackNotifyButton from './SlackNotifyButton';
import SyncStatusIcon from './SyncStatusIcon';

interface ExpenseTableProps {
  expenses: Expense[];
  onFlagUpdate?: (expenseId: string, newFlagCategory: string | null) => void;
  onApprovalUpdate?: (expenseId: string, newApprovalStatus: 'approved' | 'rejected' | null) => void;
  isAdmin?: boolean;
  isMasquerading?: boolean;
}

type SortField = 'date' | 'vendor' | 'purchaser' | 'branch' | 'department' | 'amount' | 'status';
type SortDirection = 'asc' | 'desc';

export default function ExpenseTable({ 
  expenses, 
  onFlagUpdate,
  onApprovalUpdate, 
  isAdmin = false,
  isMasquerading = false 
}: ExpenseTableProps) {
  const [updatingFlags, setUpdatingFlags] = useState<Set<string>>(new Set());
  const [updatingApprovals, setUpdatingApprovals] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [openFlagDropdown, setOpenFlagDropdown] = useState<string | null>(null);
  const [openApprovalDropdown, setOpenApprovalDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; left: number } | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  const flagButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const approvalButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // Show Notify column only if user is admin AND not masquerading
  const showNotifyColumn = isAdmin && !isMasquerading;
  
  // Show Flag column only if user is admin AND not masquerading
  const showFlagColumn = isAdmin && !isMasquerading;

  // Handle column sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'date' || field === 'amount' ? 'desc' : 'asc');
    }
  };

  // Sort expenses
  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      let aValue: any, bValue: any;
      switch (sortField) {
        case 'date':
          aValue = new Date(a.transaction_date).getTime();
          bValue = new Date(b.transaction_date).getTime();
          break;
        case 'vendor':
          aValue = a.vendor_name?.toLowerCase() || '';
          bValue = b.vendor_name?.toLowerCase() || '';
          break;
        case 'purchaser':
          aValue = a.cardholder?.toLowerCase() || '';
          bValue = b.cardholder?.toLowerCase() || '';
          break;
        case 'branch':
          aValue = a.branch?.toLowerCase() || '';
          bValue = b.branch?.toLowerCase() || '';
          break;
        case 'department':
          aValue = a.department?.toLowerCase() || '';
          bValue = b.department?.toLowerCase() || '';
          break;
        case 'amount':
          aValue = a.amount || 0;
          bValue = b.amount || 0;
          break;
        case 'status':
          aValue = a.approval_status || '';
          bValue = b.approval_status || '';
          break;
        default:
          return 0;
      }
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [expenses, sortField, sortDirection]);

  // Render sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-3 h-3 text-gray-300 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    if (sortDirection === 'asc') {
      return (
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      );
    }
    return (
      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Calculate dropdown position and coordinates when opening
  const calculateDropdownPosition = (buttonElement: HTMLButtonElement | null, dropdownHeight: number = 300): { position: 'bottom' | 'top'; coords: { top: number; left: number } } => {
    if (!buttonElement) return { position: 'bottom', coords: { top: 0, left: 0 } };
    
    const rect = buttonElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    // If not enough space below but more space above, open upward
    const position: 'bottom' | 'top' = (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) ? 'top' : 'bottom';
    
    // Calculate fixed coordinates
    const coords = {
      top: position === 'bottom' ? rect.bottom + 4 : rect.top - dropdownHeight - 4,
      left: rect.left,
    };
    
    return { position, coords };
  };

  const toggleRow = (expenseId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(expenseId)) {
        next.delete(expenseId);
      } else {
        next.add(expenseId);
      }
      return next;
    });
  };

  // Helper function to determine row background color based on flag category
  const getRowBackgroundColor = (flagCategory: string | null | undefined): string => {
    if (!flagCategory) return '';
    
    // Light red for error flags
    if (['Wrong Branch', 'Wrong Department', 'Wrong Category', 'Poor Description'].includes(flagCategory)) {
      return 'bg-red-50';
    }
    
    // Light green for positive flag
    if (flagCategory === 'Good to Sync') {
      return 'bg-green-50';
    }
    
    // Light gray for Has WO #
    if (flagCategory === 'Has WO #') {
      return 'bg-gray-50';
    }
    
    // Light yellow for all other flags
    return 'bg-yellow-50';
  };

  // Helper function to get branch icon path
  const getBranchIcon = (branchName: string): string => {
    const iconMap: Record<string, string> = {
      'Phoenix': '/logos/az.png',
      'Phoenix - North': '/logos/phx-north.png',
      'Phoenix - SouthEast': '/logos/phx-se.png',
      'Phoenix - SouthWest': '/logos/phx-sw.png',
      'Las Vegas': '/logos/lv.png',
      'Corporate': '/logos/corp.png',
    };
    return iconMap[branchName] || '';
  };

  // Helper function to get the appropriate flag icon based on category
  const getFlagIcon = (flagCategory: string | null | undefined) => {
    if (!flagCategory) {
      // Grey flag icon for unflagged items
      return (
        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
        </svg>
      );
    }

    // Green checkmark for "Good to Sync"
    if (flagCategory === 'Good to Sync') {
      return (
        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    }

    // Red X for error flags
    if (['Wrong Branch', 'Wrong Department', 'Wrong Category', 'Poor Description'].includes(flagCategory)) {
      return (
        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    }

    // Construction/hard hat icon for "Has WO #"
    if (flagCategory === 'Has WO #') {
      return (
        <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
          <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
        </svg>
      );
    }

    // Magnifying glass for "Needs Review"
    if (flagCategory === 'Needs Review') {
      return (
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 9a2 2 0 114 0 2 2 0 01-4 0z" />
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a4 4 0 00-3.446 6.032l-2.261 2.26a1 1 0 101.414 1.415l2.261-2.261A4 4 0 1011 5z" clipRule="evenodd" />
        </svg>
      );
    }

    // Warning/alert icon for "Duplicate" and "Personal" (needs follow up)
    if (['Duplicate', 'Personal'].includes(flagCategory)) {
      return (
        <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    }

    // Default grey flag for any other category
    return (
      <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
      </svg>
    );
  };

  // Helper function to get the appropriate approval icon based on status
  const getApprovalIcon = (approvalStatus: 'approved' | 'rejected' | null | undefined) => {
    if (!approvalStatus) {
      // Grey circle for no status
      return (
        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16z" clipRule="evenodd" />
        </svg>
      );
    }

    // Green checkmark for approved
    if (approvalStatus === 'approved') {
      return (
        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    }

    // Red X for rejected
    if (approvalStatus === 'rejected') {
      return (
        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    }

    // Default grey circle
    return (
      <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16z" clipRule="evenodd" />
      </svg>
    );
  };

  // Helper function to format the approval tooltip text
  const getApprovalTooltip = (expense: Expense): string => {
    if (!expense.approval_status) {
      return 'Click to set approval';
    }

    const statusText = expense.approval_status === 'approved' ? 'Approved' : 'Rejected';
    
    if (expense.approval_modified_by && expense.approval_modified_at) {
      const date = new Date(expense.approval_modified_at);
      const formattedDate = format(date, 'MMM d, yyyy h:mm a');
      return `${statusText} by ${expense.approval_modified_by} on ${formattedDate}`;
    }

    return statusText;
  };

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
    // Parse date string as YYYY-MM-DD without timezone conversion
    // Don't use new Date() directly as it interprets as UTC and converts to local timezone
    const [year, month, day] = dateString.substring(0, 10).split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return format(date, 'MMM d');
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
    setOpenFlagDropdown(null); // Close dropdown after selection

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

  const toggleFlagDropdown = (expenseId: string) => {
    const newDropdownId = openFlagDropdown === expenseId ? null : expenseId;
    if (newDropdownId) {
      const { position, coords } = calculateDropdownPosition(flagButtonRefs.current[expenseId], 300);
      setDropdownPosition(position);
      setDropdownCoords(coords);
    } else {
      setDropdownCoords(null);
    }
    setOpenFlagDropdown(newDropdownId);
  };

  const handleApprovalChange = async (expenseId: string, approvalStatus: 'approved' | 'rejected' | null) => {
    setUpdatingApprovals(prev => new Set(prev).add(expenseId));
    setOpenApprovalDropdown(null); // Close dropdown after selection

    try {
      const response = await fetch('/api/expenses/approval', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenseId,
          approvalStatus,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Trigger a refresh of the data with the new approval status AND tracking info
        if (onApprovalUpdate) {
          onApprovalUpdate(expenseId, approvalStatus);
        }
        
        // IMPORTANT: Force a page refresh to get the updated tracking data
        // This ensures we get approval_modified_by and approval_modified_at from the database
        window.location.reload();
      } else {
        console.error('Failed to update approval:', data.error);
        alert('Failed to update approval. Please try again.');
      }
    } catch (error) {
      console.error('Error updating approval:', error);
      alert('Error updating approval. Please try again.');
    } finally {
      setUpdatingApprovals(prev => {
        const next = new Set(prev);
        next.delete(expenseId);
        return next;
      });
    }
  };

  const toggleApprovalDropdown = (expenseId: string) => {
    const newDropdownId = openApprovalDropdown === expenseId ? null : expenseId;
    if (newDropdownId) {
      const { position, coords } = calculateDropdownPosition(approvalButtonRefs.current[expenseId], 120);
      setDropdownPosition(position);
      setDropdownCoords(coords);
    } else {
      setDropdownCoords(null);
    }
    setOpenApprovalDropdown(newDropdownId);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto max-h-[calc(100vh-400px)] overflow-y-auto">
        <table className="w-full table-fixed">
          <colgroup>
            {showFlagColumn && <col style={{ width: '50px' }} />}
            <col style={{ width: '50px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '60px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '280px' }} />
            <col style={{ width: '60px' }} />
            {showNotifyColumn && <col style={{ width: '60px' }} />}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              {showFlagColumn && (
                <th className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900">
                  Flag
                </th>
              )}
              <th className="px-3 py-3 text-center text-xs font-medium text-white uppercase tracking-wider bg-blue-900">
                <div className="flex items-center justify-center gap-1" title="Approval">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                  </svg>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                  </svg>
                </div>
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900 cursor-pointer hover:bg-blue-800"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1">
                  <span>Date</span>
                  <SortIcon field="date" />
                </div>
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900 cursor-pointer hover:bg-blue-800"
                onClick={() => handleSort('vendor')}
              >
                <div className="flex items-center gap-1">
                  <span>Vendor</span>
                  <SortIcon field="vendor" />
                </div>
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900 cursor-pointer hover:bg-blue-800"
                onClick={() => handleSort('purchaser')}
              >
                <div className="flex items-center gap-1">
                  <span>Purchaser</span>
                  <SortIcon field="purchaser" />
                </div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900">
                Category
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900 cursor-pointer hover:bg-blue-800"
                onClick={() => handleSort('branch')}
              >
                <div className="flex items-center gap-1">
                  <span>Branch</span>
                  <SortIcon field="branch" />
                </div>
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900 cursor-pointer hover:bg-blue-800"
                onClick={() => handleSort('department')}
              >
                <div className="flex items-center gap-1">
                  <span>Department</span>
                  <SortIcon field="department" />
                </div>
              </th>
              <th 
                className="px-3 py-3 text-right text-xs font-medium text-white uppercase tracking-wider bg-blue-900 cursor-pointer hover:bg-blue-800"
                onClick={() => handleSort('amount')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Amount</span>
                  <SortIcon field="amount" />
                </div>
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900 cursor-pointer hover:bg-blue-800"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  <span>Status</span>
                  <SortIcon field="status" />
                </div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-white uppercase tracking-wider bg-blue-900">
                Memo
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-white uppercase tracking-wider bg-blue-900">
                View
              </th>
              {showNotifyColumn && (
                <th className="px-3 py-3 text-center text-xs font-medium text-white uppercase tracking-wider bg-blue-900">
                  Notify
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={showFlagColumn ? (showNotifyColumn ? 13 : 12) : (showNotifyColumn ? 12 : 11)} className="px-6 py-12 text-center text-gray-500">
                  No expenses found. Try adjusting your filters or sync data from NetSuite.
                </td>
              </tr>
            ) : (
              sortedExpenses.map((expense) => (
                <tr 
                  key={expense.id} 
                  className={`hover:bg-gray-50 ${getRowBackgroundColor(expense.flag_category)}`}
                >
                  {/* Flag Column with Icon and Dropdown - Admin Only (Not Masquerading) */}
                  {showFlagColumn && (
                    <td className="px-3 py-3 relative">
                      <div className="relative">
                        <button
                          ref={(el) => { flagButtonRefs.current[expense.id] = el; }}
                          onClick={() => toggleFlagDropdown(expense.id)}
                          disabled={updatingFlags.has(expense.id)}
                          className={`flex items-center justify-center w-full hover:opacity-70 transition-opacity ${
                            updatingFlags.has(expense.id) ? 'opacity-50 cursor-wait' : 'cursor-pointer'
                          }`}
                          title={expense.flag_category || 'Click to flag'}
                        >
                          {getFlagIcon(expense.flag_category)}
                        </button>

                        {/* Dropdown Menu */}
                        {openFlagDropdown === expense.id && !updatingFlags.has(expense.id) && dropdownCoords && (
                          <>
                            {/* Backdrop to close dropdown */}
                            <div 
                              className="fixed inset-0 z-40" 
                              onClick={() => setOpenFlagDropdown(null)}
                            />
                            
                            {/* Dropdown with fixed positioning */}
                            <div 
                              className="fixed w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 max-h-80 overflow-y-auto"
                              style={{ 
                                top: dropdownCoords.top,
                                left: dropdownCoords.left,
                              }}
                            >
                              <button
                                onClick={() => handleFlagChange(expense.id, null)}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                                </svg>
                                <span>No Flag</span>
                              </button>
                              
                              {FLAG_CATEGORIES.map(category => (
                                <button
                                  key={category}
                                  onClick={() => handleFlagChange(expense.id, category)}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                                >
                                  <span className="w-4 h-4 flex-shrink-0">
                                    {getFlagIcon(category)}
                                  </span>
                                  <span className="truncate">{category}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  )}

                  {/* Approval Column with Icon and Dropdown */}
                  <td className="px-3 py-3 relative">
                    <div className="relative">
                      <button
                        ref={(el) => { approvalButtonRefs.current[expense.id] = el; }}
                        onClick={() => toggleApprovalDropdown(expense.id)}
                        disabled={updatingApprovals.has(expense.id)}
                        className={`flex items-center justify-center w-full hover:opacity-70 transition-opacity ${
                          updatingApprovals.has(expense.id) ? 'opacity-50 cursor-wait' : 'cursor-pointer'
                        }`}
                        title={getApprovalTooltip(expense)}
                      >
                        {getApprovalIcon(expense.approval_status)}
                      </button>

                      {/* Dropdown Menu */}
                      {openApprovalDropdown === expense.id && !updatingApprovals.has(expense.id) && dropdownCoords && (
                        <>
                          {/* Backdrop to close dropdown */}
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setOpenApprovalDropdown(null)}
                          />
                          
                          {/* Dropdown with fixed positioning */}
                          <div 
                            className="fixed w-32 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1"
                            style={{ 
                              top: dropdownCoords.top,
                              left: dropdownCoords.left,
                            }}
                          >
                            <button
                              onClick={() => handleApprovalChange(expense.id, null)}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16z" clipRule="evenodd" />
                              </svg>
                              <span>No Status</span>
                            </button>
                            
                            <button
                              onClick={() => handleApprovalChange(expense.id, 'approved')}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span>Approved</span>
                            </button>

                            <button
                              onClick={() => handleApprovalChange(expense.id, 'rejected')}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                              <span>Rejected</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
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
                  <td className="px-3 py-3 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <span className="truncate" title={expense.cardholder || ''}>
                        {expense.cardholder || '-'}
                      </span>
                      {expense.flag_category && expense.flag_category !== 'Good to Sync' && (
                        <span 
                          className="flex-shrink-0 cursor-help" 
                          title={`🚩 ${expense.flag_category}`}
                        >
                          <span className="text-base">
                            {getFlagIcon(expense.flag_category)}
                          </span>
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Category Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.category || ''}>
                    {expense.category || '-'}
                  </td>

                  {/* Branch Column */}
                  <td className="px-3 py-3">
                    {expense.branch && expense.branch !== 'QnVkZ2V0OjcyNDQ0MQ==-' && !expense.branch.includes('=') ? (
                      getBranchIcon(expense.branch) ? (
                        <div className="flex items-center justify-center">
                          <Image
                            src={getBranchIcon(expense.branch)}
                            alt={expense.branch}
                            width={24}
                            height={24}
                            className="object-contain"
                            title={expense.branch}
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 truncate" title={expense.branch}>
                          {expense.branch}
                        </span>
                      )
                    ) : null}
                  </td>

                  {/* Department Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.department || ''}>
                    {expense.department || '-'}
                  </td>

                  {/* Amount Column */}
                  <td className="px-3 py-3 text-sm text-gray-900 text-right font-medium">
                    {formatCurrency(expense.amount, expense.currency)}
                  </td>

                  {/* Status Column with Sync Status Icon */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <SyncStatusIcon 
                        syncStatus={expense.bill_sync_status}
                        transactionType={expense.transaction_type}
                      />
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        expense.status === 'Paid' || expense.status === 'Paid In Full' || expense.status === 'Complete' ? 'bg-green-100 text-green-800' :
                        expense.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                        expense.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {expense.status}
                      </span>
                    </div>
                  </td>

                  {/* Memo Column */}
                  <td className="px-3 py-3 text-sm text-gray-600 truncate" title={expense.memo || ''}>
                    {expense.memo || '-'}
                  </td>

                  {/* View Column */}
                  <td className="px-3 py-3 text-center">
                    <a
                      href={getTransactionUrl(expense)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                      title="View in NetSuite/Bill.com"
                    >
                      <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </td>

                  {/* Notify Column (Admin Only) */}
                  {showNotifyColumn && (
                    <td className="px-3 py-3 text-center">
                      <SlackNotifyButton
                        expenseId={expense.id}
                        netsuiteId={expense.netsuite_id}
                        transactionType={expense.transaction_type}
                        purchaserName={expense.cardholder || ''}
                        vendor={expense.vendor_name}
                        amount={expense.amount}
                        date={expense.transaction_date}
                        memo={expense.memo}
                        currentBranch={expense.branch}
                        currentDepartment={expense.department}
                        currentCategory={expense.category}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden divide-y divide-gray-200">
        {expenses.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No expenses found. Try adjusting your filters or sync data from NetSuite.
          </div>
        ) : (
          sortedExpenses.map((expense) => {
            const isExpanded = expandedRows.has(expense.id);
            const rowBgColor = getRowBackgroundColor(expense.flag_category);
            
            return (
              <div 
                key={expense.id} 
                className={`p-4 ${rowBgColor}`}
              >
                {/* Card Header - Always Visible */}
                <div 
                  className="cursor-pointer"
                  onClick={() => toggleRow(expense.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {expense.transaction_type === 'Credit Card' ? (
                          <Image
                            src="/logos/bill.png"
                            alt="Bill.com"
                            width={16}
                            height={16}
                            className="flex-shrink-0"
                          />
                        ) : (
                          <Image
                            src="/logos/netsuite.png"
                            alt="NetSuite"
                            width={16}
                            height={16}
                            className="flex-shrink-0"
                          />
                        )}
                        <div className="font-medium text-gray-900 truncate">
                          {expense.vendor_name}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatDate(expense.transaction_date)}
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <div className="text-lg font-semibold text-gray-900">
                        {formatCurrency(expense.amount, expense.currency)}
                      </div>
                      {expense.cardholder && (
                        <div className="text-sm text-gray-500 flex items-center justify-end gap-1">
                          <span>{expense.cardholder}</span>
                          {expense.flag_category && expense.flag_category !== 'Good to Sync' && (
                            <span 
                              className="flex-shrink-0 cursor-help inline-flex items-center" 
                              title={`🚩 ${expense.flag_category}`}
                            >
                              <span className="text-xs">
                                {getFlagIcon(expense.flag_category)}
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SyncStatusIcon 
                        syncStatus={expense.bill_sync_status}
                        transactionType={expense.transaction_type}
                      />
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        expense.status === 'Paid' || expense.status === 'Paid In Full' || expense.status === 'Complete' ? 'bg-green-100 text-green-800' :
                        expense.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                        expense.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {expense.status}
                      </span>
                    </div>
                    
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg 
                        className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                    {/* Flag Display - Show for non-admins (read-only) */}
                    {!showFlagColumn && expense.flag_category && expense.flag_category !== 'Good to Sync' && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                        {getFlagIcon(expense.flag_category)}
                        <span className="text-sm font-medium text-gray-700">Flag: {expense.flag_category}</span>
                      </div>
                    )}

                    {/* Flag Dropdown - Show for admins not masquerading */}
                    {showFlagColumn && (
                      <div className="relative">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-500">Flag:</span>
                        </div>
                        {updatingFlags.has(expense.id) ? (
                          <div className="flex items-center gap-2 py-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span className="text-xs text-gray-500">Updating...</span>
                          </div>
                        ) : (
                          <button
                            ref={(el) => { flagButtonRefs.current[expense.id] = el; }}
                            onClick={() => toggleFlagDropdown(expense.id)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors bg-white"
                          >
                            <span className="flex items-center gap-2">
                              {getFlagIcon(expense.flag_category)}
                              <span className="truncate">
                                {expense.flag_category || 'No Flag'}
                              </span>
                            </span>
                            <svg className="w-3 h-3 ml-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}

                        {/* Mobile Dropdown Menu */}
                        {openFlagDropdown === expense.id && !updatingFlags.has(expense.id) && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setOpenFlagDropdown(null)}
                            />
                            <div className={`absolute ${dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} right-0 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1 max-h-60 overflow-y-auto`}>
                              <button
                                onClick={() => handleFlagChange(expense.id, null)}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                                </svg>
                                <span>No Flag</span>
                              </button>
                              
                              {FLAG_CATEGORIES.map((category) => (
                                <button
                                  key={category}
                                  onClick={() => handleFlagChange(expense.id, category)}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                                >
                                  {getFlagIcon(category)}
                                  <span>{category}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Approval Dropdown */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-500">Approval:</span>
                      </div>
                      {updatingApprovals.has(expense.id) ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span className="text-xs text-gray-500">Updating...</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <button
                            ref={(el) => { approvalButtonRefs.current[expense.id] = el; }}
                            onClick={() => toggleApprovalDropdown(expense.id)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors bg-white"
                          >
                            <span className="flex items-center gap-2">
                              {getApprovalIcon(expense.approval_status)}
                              <span className="truncate">
                                {!expense.approval_status ? 'No Status' : 
                                 expense.approval_status === 'approved' ? 'Approved' : 'Rejected'}
                              </span>
                            </span>
                            <svg className="w-3 h-3 ml-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {/* Mobile Dropdown Menu */}
                          {openApprovalDropdown === expense.id && !updatingApprovals.has(expense.id) && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setOpenApprovalDropdown(null)}
                              />
                              <div className={`absolute ${dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} right-0 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1`}>
                                <button
                                  onClick={() => handleApprovalChange(expense.id, null)}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16z" clipRule="evenodd" />
                                  </svg>
                                  <span>No Status</span>
                                </button>
                                
                                <button
                                  onClick={() => handleApprovalChange(expense.id, 'approved')}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span>Approved</span>
                                </button>

                                <button
                                  onClick={() => handleApprovalChange(expense.id, 'rejected')}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                  </svg>
                                  <span>Rejected</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Category */}
                    {expense.category && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">Category:</span>
                        <span className="text-xs text-gray-900">{expense.category}</span>
                      </div>
                    )}

                    {/* Branch */}
                    {expense.branch && expense.branch !== 'QnVkZ2V0OjcyNDQ0MQ==-' && !expense.branch.includes('=') && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">Branch:</span>
                        {getBranchIcon(expense.branch) ? (
                          <div className="flex items-center gap-2">
                            <Image
                              src={getBranchIcon(expense.branch)}
                              alt={expense.branch}
                              width={20}
                              height={20}
                              className="object-contain"
                            />
                            <span className="text-xs text-gray-900">{expense.branch}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-900">{expense.branch}</span>
                        )}
                      </div>
                    )}

                    {/* Department */}
                    {expense.department && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">Department:</span>
                        <span className="text-xs text-gray-900">{expense.department}</span>
                      </div>
                    )}

                    {/* Memo */}
                    {expense.memo && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-gray-500">Memo:</span>
                        <span className="text-xs text-gray-900">{expense.memo}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <a
                        href={getTransactionUrl(expense)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View
                      </a>
                      
                      {/* Slack Notify Button - Show for admins not masquerading */}
                      {showNotifyColumn && expense.cardholder && (
                        <div className="flex-1">
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
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}