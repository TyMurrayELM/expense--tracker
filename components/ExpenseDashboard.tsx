'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Expense } from '@/types/expense';
import ExpenseTable from './ExpenseTable';
import FilterBar from './FilterBar';
import KPICard from './KPICard';

interface ExpenseDashboardProps {
  initialExpenses: Expense[];
  vendors: string[];
  purchasers: string[];
  activeTab: 'dashboard' | 'trends' | 'admin';
  onTabChange: (tab: 'dashboard' | 'trends' | 'admin') => void;
  isAdmin: boolean;
  isMasquerading?: boolean;
}

// Type definition for filters state
interface FiltersState {
  months: string[];
  branch: string;
  vendor: string;
  department: string;
  purchaser: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  showFlagged: string;
  flagCategory: string; // NEW: Filter for specific flag category
  transactionType: string;
  status: string;
  approvalStatus: string; // Filter for approval status
  syncStatus: string; // Filter for Bill.com sync status
}

// Type definition for trends filters
interface TrendsFiltersState {
  dateFrom: string;
  dateTo: string;
}

// Type definition for collapsible sections
interface SectionsCollapsedState {
  dateFilters: boolean;
  byBranch: boolean;
  bySecondary: boolean;
  byThirdLayer: boolean;
  byFourthLayer: boolean;
  filters: boolean;
}

export default function ExpenseDashboard({ 
  initialExpenses, 
  vendors, 
  purchasers,
  activeTab,
  onTabChange,
  isAdmin = false,
  isMasquerading = false
}: ExpenseDashboardProps) {
  // Get current month in YYYY-MM format
  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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

  // Initialize filters with defaults first (for SSR)
  const getDefaultFilters = (): FiltersState => ({
    months: [getCurrentMonth()],
    branch: 'all',
    vendor: 'all',
    department: 'all',
    purchaser: 'all',
    category: 'all',
    dateFrom: '',
    dateTo: '',
    showFlagged: 'all',
    flagCategory: 'all',
    transactionType: 'all',
    status: 'all',
    approvalStatus: 'all',
    syncStatus: 'all',
  });

  // Helper functions for localStorage
  const getStoredFilters = (): FiltersState | null => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('expenseDashboardFilters');
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      
      // Merge with defaults to handle any missing fields from older stored data
      const defaults = getDefaultFilters();
      return {
        ...defaults,
        ...parsed,
        // Ensure months is always a valid array
        months: Array.isArray(parsed.months) && parsed.months.length > 0 
          ? parsed.months 
          : defaults.months,
      };
    } catch (error) {
      console.error('Error reading filters from localStorage:', error);
      return null;
    }
  };

  const saveFiltersToStorage = (filters: FiltersState) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('expenseDashboardFilters', JSON.stringify(filters));
    } catch (error) {
      console.error('Error saving filters to localStorage:', error);
    }
  };

  const [expenses, setExpenses] = useState(initialExpenses);
  
  // Update expenses when initialExpenses changes (masquerade mode)
  useEffect(() => {
    setExpenses(initialExpenses);
  }, [initialExpenses]);

  const [filters, setFilters] = useState<FiltersState>(getDefaultFilters());
  
  // Track if initial load from localStorage has completed
  const hasLoadedFromStorage = useRef(false);

  // Load filters from localStorage after mount (client-side only)
  useEffect(() => {
    const storedFilters = getStoredFilters();
    if (storedFilters) {
      setFilters(storedFilters);
    }
    // Mark that we've completed the initial load
    hasLoadedFromStorage.current = true;
  }, []); // Run once on mount

  // Save filters to localStorage whenever they change (but only after initial load)
  useEffect(() => {
    // Skip saving on the initial render - only save after user makes changes
    if (!hasLoadedFromStorage.current) return;
    saveFiltersToStorage(filters);
  }, [filters]);

  // Separate filters for Trends tab
  const [trendsFilters, setTrendsFilters] = useState<TrendsFiltersState>({
    dateFrom: '2025-12-01',
    dateTo: '',
  });

  const [secondaryView, setSecondaryView] = useState<'department' | 'purchaser' | 'vendor' | 'category'>('department');
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [slackSendingDepartment, setSlackSendingDepartment] = useState<string | null>(null);

  // Initialize collapsible sections with defaults first (for SSR)
  const getDefaultSectionsCollapsed = (): SectionsCollapsedState => ({
    dateFilters: false,
    byBranch: false,
    bySecondary: true,
    byThirdLayer: true,
    byFourthLayer: true,
    filters: false,
  });

  // Collapsible sections state
  const [sectionsCollapsed, setSectionsCollapsed] = useState<SectionsCollapsedState>(getDefaultSectionsCollapsed());

  // Load collapsed sections from localStorage after mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('expenseDashboardSections');
        if (stored) {
          setSectionsCollapsed(JSON.parse(stored));
        }
      } catch (error) {
        console.error('Error reading sections from localStorage:', error);
      }
    }
  }, []); // Run once on mount

  // Save collapsed sections to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('expenseDashboardSections', JSON.stringify(sectionsCollapsed));
      } catch (error) {
        console.error('Error saving sections to localStorage:', error);
      }
    }
  }, [sectionsCollapsed]);

  const toggleSection = (section: keyof typeof sectionsCollapsed) => {
    setSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Helper function to normalize department names (combine variants)
  const normalizeDepartmentName = (department: string): string => {
    const lower = department.toLowerCase();
    // Combine all Maintenance variants into "Maintenance"
    if (lower.includes('maintenance')) {
      return 'Maintenance';
    }
    // Combine Fleet & Equipment variants
    if (lower.includes('fleet') || lower.includes('equipment & fleet')) {
      return 'Fleet & Equipment';
    }
    return department;
  };

  // Filter expenses based on current filters
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      // Month filter (multi-select YYYY-MM format)
      if (filters.months.length > 0 && !filters.months.includes('all')) {
        const expenseMonth = expense.transaction_date.substring(0, 7); // Get YYYY-MM
        if (!filters.months.includes(expenseMonth)) {
          return false;
        }
      }

      // Branch filter
      if (filters.branch !== 'all' && expense.branch !== filters.branch) {
        return false;
      }

      // Vendor filter
      if (filters.vendor !== 'all' && expense.vendor_name !== filters.vendor) {
        return false;
      }

      // Department filter (use normalized name to match combined departments)
      if (filters.department !== 'all') {
        const normalizedExpDept = expense.department ? normalizeDepartmentName(expense.department) : '';
        if (normalizedExpDept !== filters.department) {
          return false;
        }
      }

      // Purchaser filter (cardholder)
      if (filters.purchaser !== 'all' && expense.cardholder !== filters.purchaser) {
        return false;
      }

      // Category filter
      if (filters.category !== 'all' && expense.category !== filters.category) {
        return false;
      }

      // Date from filter (works independently of month selection)
      // Extract just the date portion (YYYY-MM-DD) to avoid timezone issues
      if (filters.dateFrom) {
        const expenseDate = expense.transaction_date.substring(0, 10); // Get YYYY-MM-DD
        if (expenseDate < filters.dateFrom) {
          return false;
        }
      }

      // Date to filter (works independently of month selection)
      // Extract just the date portion (YYYY-MM-DD) to avoid timezone issues
      if (filters.dateTo) {
        const expenseDate = expense.transaction_date.substring(0, 10); // Get YYYY-MM-DD
        if (expenseDate > filters.dateTo) {
          return false;
        }
      }

      // Flag filter
      if (filters.showFlagged === 'flagged' && (!expense.flag_category || expense.flag_category === 'Good to Sync')) {
        return false;
      }
      if (filters.showFlagged === 'unflagged' && expense.flag_category && expense.flag_category !== 'Good to Sync') {
        return false;
      }

      // Flag category filter (NEW)
      if (filters.flagCategory !== 'all' && expense.flag_category !== filters.flagCategory) {
        return false;
      }

      // Transaction type filter
      if (filters.transactionType !== 'all' && expense.transaction_type !== filters.transactionType) {
        return false;
      }

      // Completion Status filter (renamed from Status)
      if (filters.status !== 'all' && expense.status !== filters.status) {
        return false;
      }

      // Approval Status filter
      if (filters.approvalStatus !== 'all') {
        if (filters.approvalStatus === 'approved' && expense.approval_status !== 'approved') {
          return false;
        }
        if (filters.approvalStatus === 'rejected' && expense.approval_status !== 'rejected') {
          return false;
        }
        if (filters.approvalStatus === 'pending' && expense.approval_status !== null) {
          return false;
        }
      }

      // Sync status filter (Bill.com credit cards only)
      if (filters.syncStatus !== 'all') {
        // Only filter credit card transactions by sync status
        if (expense.transaction_type === 'Credit Card') {
          if (filters.syncStatus === 'synced' && expense.bill_sync_status !== 'SYNCED') {
            return false;
          }
          if (filters.syncStatus === 'not-synced' && expense.bill_sync_status === 'SYNCED') {
            return false;
          }
        }
      }

      return true;
    });
  }, [expenses, filters]);

  // Separate filtered expenses for Trends tab
  const trendsFilteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      // Date from filter
      if (trendsFilters.dateFrom && expense.transaction_date < trendsFilters.dateFrom) {
        return false;
      }

      // Date to filter
      if (trendsFilters.dateTo && expense.transaction_date > trendsFilters.dateTo) {
        return false;
      }

      return true;
    });
  }, [expenses, trendsFilters]);

  // Calculate KPIs based on filtered data
  const kpis = useMemo(() => {
    const totalAmount = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const totalCount = filteredExpenses.length;
    const flaggedCount = filteredExpenses.filter(exp => exp.flag_category && exp.flag_category !== 'Good to Sync').length;

    const byBranch: Record<string, { amount: number; count: number; unapprovedAmount: number; unapprovedCount: number }> = {};
    const byDepartment: Record<string, { amount: number; count: number; unapprovedAmount: number; unapprovedCount: number }> = {};
    const byVendor: Record<string, { amount: number; count: number }> = {};
    const byPurchaser: Record<string, { amount: number; count: number }> = {};
    const byCategory: Record<string, { amount: number; count: number }> = {};
    
    filteredExpenses.forEach(exp => {
      const isUnapproved = exp.approval_status !== 'approved';
      const amount = Number(exp.amount);
      
      if (exp.branch) {
        if (!byBranch[exp.branch]) {
          byBranch[exp.branch] = { amount: 0, count: 0, unapprovedAmount: 0, unapprovedCount: 0 };
        }
        byBranch[exp.branch].amount += amount;
        byBranch[exp.branch].count += 1;
        if (isUnapproved) {
          byBranch[exp.branch].unapprovedAmount += amount;
          byBranch[exp.branch].unapprovedCount += 1;
        }
      }
      if (exp.department) {
        // Normalize department name to combine variants (e.g., "Maintenance Recurring" -> "Maintenance")
        const normalizedDept = normalizeDepartmentName(exp.department);
        if (!byDepartment[normalizedDept]) {
          byDepartment[normalizedDept] = { amount: 0, count: 0, unapprovedAmount: 0, unapprovedCount: 0 };
        }
        byDepartment[normalizedDept].amount += amount;
        byDepartment[normalizedDept].count += 1;
        if (isUnapproved) {
          byDepartment[normalizedDept].unapprovedAmount += amount;
          byDepartment[normalizedDept].unapprovedCount += 1;
        }
      }
      if (exp.vendor_name) {
        if (!byVendor[exp.vendor_name]) {
          byVendor[exp.vendor_name] = { amount: 0, count: 0 };
        }
        byVendor[exp.vendor_name].amount += amount;
        byVendor[exp.vendor_name].count += 1;
      }
      if (exp.cardholder) {
        if (!byPurchaser[exp.cardholder]) {
          byPurchaser[exp.cardholder] = { amount: 0, count: 0 };
        }
        byPurchaser[exp.cardholder].amount += amount;
        byPurchaser[exp.cardholder].count += 1;
      }
      if (exp.category) {
        if (!byCategory[exp.category]) {
          byCategory[exp.category] = { amount: 0, count: 0 };
        }
        byCategory[exp.category].amount += amount;
        byCategory[exp.category].count += 1;
      }
    });

    return { totalAmount, totalCount, flaggedCount, byBranch, byDepartment, byVendor, byPurchaser, byCategory };
  }, [filteredExpenses]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const cleanDepartmentName = (department: string) => {
    // Remove redundant "Maintenance :" prefix from maintenance department names
    if (department.startsWith('Maintenance : Maintenance')) {
      return department.replace('Maintenance : ', '');
    }
    return department;
  };

  // Get unique statuses from all expenses
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(
      expenses
        .map(e => e.status)
        .filter((status): status is string => status !== null && status !== undefined && status !== '')
    );
    return Array.from(statuses).sort();
  }, [expenses]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleBranchClick = (branch: string) => {
    // If clicking the same branch, clear the filter (toggle off)
    if (filters.branch === branch) {
      setFilters(prev => ({ ...prev, branch: 'all' }));
    } else {
      setFilters(prev => ({ ...prev, branch: branch }));
    }
  };

  const handleDepartmentClick = (department: string) => {
    // If clicking the same department, clear the filter (toggle off)
    if (filters.department === department) {
      setFilters(prev => ({ ...prev, department: 'all', purchaser: 'all' }));
    } else {
      setFilters(prev => ({ ...prev, department: department, purchaser: 'all' }));
      // Don't switch views - third layer will appear below
    }
  };

  const handleVendorClick = (vendor: string) => {
    // If clicking the same vendor, clear the filter (toggle off)
    if (filters.vendor === vendor) {
      setFilters(prev => ({ ...prev, vendor: 'all' }));
    } else {
      setFilters(prev => ({ ...prev, vendor: vendor }));
      // Don't switch views - just filter
    }
  };

  const handlePurchaserClick = (purchaser: string) => {
    // If clicking the same purchaser, clear the filter (toggle off)
    if (filters.purchaser === purchaser) {
      setFilters(prev => ({ ...prev, purchaser: 'all', vendor: 'all' }));
    } else {
      setFilters(prev => ({ ...prev, purchaser: purchaser, vendor: 'all' }));
    }
  };

  const handleCategoryClick = (category: string) => {
    // If clicking the same category, clear the filter (toggle off)
    if (filters.category === category) {
      setFilters(prev => ({ ...prev, category: 'all' }));
    } else {
      setFilters(prev => ({ ...prev, category: category }));
      // Don't switch views - just filter
    }
  };

  const handleTotalClick = () => {
    // Reset all filters EXCEPT month selection
    setFilters(prev => ({
      ...prev,
      branch: 'all',
      vendor: 'all',
      department: 'all',
      purchaser: 'all',
      category: 'all',
      dateFrom: '',
      dateTo: '',
      showFlagged: 'all',
      flagCategory: 'all',
      transactionType: 'all',
      status: 'all',
      approvalStatus: 'all',
      syncStatus: 'all',
    }));
  };

  const handleFlaggedClick = () => {
    // Toggle between showing all and showing only flagged
    setFilters(prev => ({
      ...prev,
      showFlagged: prev.showFlagged === 'flagged' ? 'all' : 'flagged'
    }));
  };

  const handleFlagUpdate = (expenseId: string, newFlagCategory: string | null) => {
    // Update the local expense state with the new flag
    setExpenses(prev => prev.map(expense => 
      expense.id === expenseId 
        ? { ...expense, flag_category: newFlagCategory }
        : expense
    ));
  };

  const handleApprovalUpdate = (expenseId: string, newApprovalStatus: 'approved' | 'rejected' | null) => {
    // Update the local expense state with the new approval status
    setExpenses(prev => prev.map(expense => 
      expense.id === expenseId 
        ? { ...expense, approval_status: newApprovalStatus }
        : expense
    ));
  };

  // Handler for sending department summary to Slack
  const handleSlackDepartmentSummary = async (department: string, data: { amount: number; count: number; unapprovedAmount: number; unapprovedCount: number }) => {
    if (!filters.branch || filters.branch === 'all') {
      alert('Please select a branch first before sending to Slack.');
      return;
    }

    const selectedMonth = filters.months.length === 1 && filters.months[0] !== 'all' 
      ? filters.months[0] 
      : getCurrentMonth();

    setSlackSendingDepartment(department);

    try {
      const response = await fetch('/api/notify/slack-department-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch: filters.branch,
          department: department,
          month: selectedMonth,
          totalAmount: data.amount,
          totalCount: data.count,
          unapprovedAmount: data.unapprovedAmount,
          unapprovedCount: data.unapprovedCount,
          dashboardUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ ${result.message}`);
      } else {
        alert(`❌ Failed: ${result.error}\n${result.suggestion || ''}`);
      }
    } catch (error: any) {
      console.error('Error sending Slack notification:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSlackSendingDepartment(null);
    }
  };

  return (
    <>
      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <>
      {/* Date Filters */}
      <div className="mb-6">
        <button
          onClick={() => toggleSection('dateFilters')}
          className="flex items-center gap-2 text-lg font-semibold text-gray-700 mb-3 hover:text-gray-900 transition-colors"
        >
          <svg 
            className={`w-5 h-5 transition-transform duration-200 ${sectionsCollapsed.dateFilters ? '-rotate-90' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Date Filters
        </button>
        {!sectionsCollapsed.dateFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Months</label>
              <button
                onClick={() => setMonthDropdownOpen(!monthDropdownOpen)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hover:bg-gray-50 flex items-center justify-between"
              >
                <span className="text-gray-700">
                  {filters.months.includes('all') 
                    ? 'All Months' 
                    : filters.months.length === 0
                    ? 'Select months...'
                    : filters.months.length === 1
                    ? (() => {
                        const monthLabels: Record<string, string> = {
                          '2025-10': 'Oct 2025',
                          '2025-11': 'Nov 2025',
                          '2025-12': 'Dec 2025',
                          '2026-01': 'Jan 2026',
                          '2026-02': 'Feb 2026',
                          '2026-03': 'Mar 2026',
                        };
                        return monthLabels[filters.months[0]] || filters.months[0];
                      })()
                    : `${filters.months.length} months selected`
                  }
                </span>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {monthDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setMonthDropdownOpen(false)}
                  />
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {[
                      { value: 'all', label: 'All Months' },
                      { value: '2025-10', label: 'October 2025' },
                      { value: '2025-11', label: 'November 2025' },
                      { value: '2025-12', label: 'December 2025' },
                      { value: '2026-01', label: 'January 2026' },
                      { value: '2026-02', label: 'February 2026' },
                      { value: '2026-03', label: 'March 2026' },
                    ].map((month) => {
                      const isSelected = filters.months.includes(month.value);
                      const isAllSelected = filters.months.includes('all');
                      
                      return (
                        <label
                          key={month.value}
                          className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || (month.value !== 'all' && isAllSelected)}
                            onChange={() => {
                              if (month.value === 'all') {
                                setFilters(prev => ({
                                  ...prev,
                                  months: isAllSelected ? [] : ['all']
                                }));
                              } else {
                                setFilters(prev => {
                                  let newMonths = prev.months.filter(m => m !== 'all');
                                  
                                  if (isSelected) {
                                    newMonths = newMonths.filter(m => m !== month.value);
                                  } else {
                                    newMonths = [...newMonths, month.value];
                                  }
                                  
                                  return { ...prev, months: newMonths };
                                });
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">{month.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <input 
                type="date"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.dateFrom || ''}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <input 
                type="date"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.dateTo || ''}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Branch KPI Cards */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection('byBranch')}
          className="flex items-center gap-2 text-lg font-semibold text-gray-700 mb-3 hover:text-gray-900 transition-colors"
        >
          <svg 
            className={`w-5 h-5 transition-transform duration-200 ${sectionsCollapsed.byBranch ? '-rotate-90' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          By Branch
        </button>
        {!sectionsCollapsed.byBranch && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
          <KPICard
            title="Total Expenses"
            value={formatCurrency(kpis.totalAmount)}
            subtitle={`${kpis.totalCount} transactions`}
            bgColor="bg-white"
            size="small"
            onClick={handleTotalClick}
            isActive={filters.branch === 'all' && filters.department === 'all' && filters.vendor === 'all' && filters.purchaser === 'all' && filters.showFlagged === 'all' && filters.transactionType === 'all' && filters.status === 'all' && filters.category === 'all'}
          />
          <KPICard
            title="Flagged Items"
            value={kpis.flaggedCount.toString()}
            subtitle={`${formatCurrency(filteredExpenses.filter(e => e.flag_category && e.flag_category !== 'Good to Sync').reduce((sum, e) => sum + Number(e.amount), 0))}`}
            bgColor={filters.showFlagged === 'flagged' ? 'bg-yellow-100' : 'bg-yellow-50'}
            size="small"
            onClick={handleFlaggedClick}
            isActive={filters.showFlagged === 'flagged'}
          />
          <KPICard
            title="Phoenix - North"
            value={formatCurrency(kpis.byBranch['Phoenix - North']?.amount || 0)}
            subtitle={`${kpis.byBranch['Phoenix - North']?.count || 0} transactions`}
            bgColor="bg-green-100"
            size="small"
            onClick={() => handleBranchClick('Phoenix - North')}
            isActive={filters.branch === 'Phoenix - North'}
            icon={getBranchIcon('Phoenix - North')}
          />
          <KPICard
            title="Phoenix - SouthEast"
            value={formatCurrency(kpis.byBranch['Phoenix - SouthEast']?.amount || 0)}
            subtitle={`${kpis.byBranch['Phoenix - SouthEast']?.count || 0} transactions`}
            bgColor="bg-red-100"
            size="small"
            onClick={() => handleBranchClick('Phoenix - SouthEast')}
            isActive={filters.branch === 'Phoenix - SouthEast'}
            icon={getBranchIcon('Phoenix - SouthEast')}
          />
          <KPICard
            title="Phoenix - SouthWest"
            value={formatCurrency(kpis.byBranch['Phoenix - SouthWest']?.amount || 0)}
            subtitle={`${kpis.byBranch['Phoenix - SouthWest']?.count || 0} transactions`}
            bgColor="bg-blue-100"
            size="small"
            onClick={() => handleBranchClick('Phoenix - SouthWest')}
            isActive={filters.branch === 'Phoenix - SouthWest'}
            icon={getBranchIcon('Phoenix - SouthWest')}
          />
          <KPICard
            title="Las Vegas"
            value={formatCurrency(kpis.byBranch['Las Vegas']?.amount || 0)}
            subtitle={`${kpis.byBranch['Las Vegas']?.count || 0} transactions`}
            bgColor="bg-yellow-100"
            size="small"
            onClick={() => handleBranchClick('Las Vegas')}
            isActive={filters.branch === 'Las Vegas'}
            icon={getBranchIcon('Las Vegas')}
          />
          <KPICard
            title="Phoenix"
            value={formatCurrency(kpis.byBranch['Phoenix']?.amount || 0)}
            subtitle={`${kpis.byBranch['Phoenix']?.count || 0} transactions`}
            bgColor="bg-orange-100"
            size="small"
            onClick={() => handleBranchClick('Phoenix')}
            isActive={filters.branch === 'Phoenix'}
            icon={getBranchIcon('Phoenix')}
          />
          <KPICard
            title="Corporate"
            value={formatCurrency(kpis.byBranch['Corporate']?.amount || 0)}
            subtitle={`${kpis.byBranch['Corporate']?.count || 0} transactions`}
            bgColor="bg-gray-100"
            size="small"
            onClick={() => handleBranchClick('Corporate')}
            isActive={filters.branch === 'Corporate'}
            icon={getBranchIcon('Corporate')}
          />
        </div>
        )}
      </div>

      {/* Dynamic View KPI Cards - Department/Purchaser/Vendor/Category */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={() => toggleSection('bySecondary')}
            className="flex items-center gap-2 text-lg font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            <svg 
              className={`w-5 h-5 transition-transform duration-200 ${sectionsCollapsed.bySecondary ? '-rotate-90' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span>
            {secondaryView === 'department' && 'By Department'}
            {secondaryView === 'purchaser' && 'By Purchaser'}
            {secondaryView === 'vendor' && 'By Vendor'}
            {secondaryView === 'category' && 'By Purchase Category'}
            {/* Show active filters as context */}
            {filters.department !== 'all' && secondaryView === 'purchaser' && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                in {cleanDepartmentName(filters.department)}
              </span>
            )}
            {filters.purchaser !== 'all' && secondaryView === 'vendor' && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                for {filters.purchaser}
              </span>
            )}
            {filters.vendor !== 'all' && secondaryView === 'department' && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                for {filters.vendor}
              </span>
            )}
            </span>
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setSecondaryView('department')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                secondaryView === 'department'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Department
            </button>
            <button
              onClick={() => setSecondaryView('purchaser')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                secondaryView === 'purchaser'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Purchaser
            </button>
            <button
              onClick={() => setSecondaryView('vendor')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                secondaryView === 'vendor'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Vendor
            </button>
            <button
              onClick={() => setSecondaryView('category')}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                secondaryView === 'category'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Category
            </button>
          </div>
        </div>
        {!sectionsCollapsed.bySecondary && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {secondaryView === 'department' && (
            <>
              {Object.entries(kpis.byDepartment)
                .sort(([, a], [, b]) => b.amount - a.amount)
                .map(([department, data]) => (
                  <KPICard
                    key={department}
                    title={cleanDepartmentName(department)}
                    value={formatCurrency(data.amount)}
                    subtitle={`${data.count} transactions`}
                    size="small"
                    onClick={() => handleDepartmentClick(department)}
                    isActive={filters.department === department}
                    showSlackButton={isAdmin && filters.branch !== 'all'}
                    onSlackClick={() => handleSlackDepartmentSummary(department, data)}
                    slackSending={slackSendingDepartment === department}
                    unapprovedCount={data.unapprovedCount}
                    unapprovedAmount={data.unapprovedAmount}
                  />
                ))}
              {Object.keys(kpis.byDepartment).length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-8">
                  No department data available
                </div>
              )}
            </>
          )}
          {secondaryView === 'purchaser' && (
            <>
              {Object.entries(kpis.byPurchaser)
                .sort(([, a], [, b]) => b.amount - a.amount)
                .map(([purchaser, data]) => (
                  <KPICard
                    key={purchaser}
                    title={purchaser}
                    value={formatCurrency(data.amount)}
                    subtitle={`${data.count} transactions`}
                    size="small"
                    onClick={() => handlePurchaserClick(purchaser)}
                    isActive={filters.purchaser === purchaser}
                    bgColor={filters.purchaser === purchaser ? 'bg-purple-50' : 'bg-white'}
                  />
                ))}
              {Object.keys(kpis.byPurchaser).length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-8">
                  No purchaser data available
                </div>
              )}
            </>
          )}
          {secondaryView === 'vendor' && (
            <>
              {Object.entries(kpis.byVendor)
                .sort(([, a], [, b]) => b.amount - a.amount)
                .slice(0, 40)
                .map(([vendor, data]) => (
                  <KPICard
                    key={vendor}
                    title={vendor}
                    value={formatCurrency(data.amount)}
                    subtitle={`${data.count} transactions`}
                    size="small"
                    onClick={() => handleVendorClick(vendor)}
                    isActive={filters.vendor === vendor}
                    bgColor={filters.vendor === vendor ? 'bg-indigo-50' : 'bg-white'}
                  />
                ))}
              {Object.keys(kpis.byVendor).length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-8">
                  No vendor data available
                </div>
              )}
            </>
          )}
          {secondaryView === 'category' && (
            <>
              {Object.entries(kpis.byCategory)
                .sort(([, a], [, b]) => b.amount - a.amount)
                .map(([category, data]) => (
                  <KPICard
                    key={category}
                    title={category}
                    value={formatCurrency(data.amount)}
                    subtitle={`${data.count} transactions`}
                    size="small"
                    onClick={() => handleCategoryClick(category)}
                    isActive={filters.category === category}
                    bgColor={filters.category === category ? 'bg-teal-50' : 'bg-white'}
                  />
                ))}
              {Object.keys(kpis.byCategory).length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-8">
                  No category data available
                </div>
              )}
            </>
          )}
        </div>
        )}
      </div>

      {/* Third Layer - Shows Purchasers when a Department is selected */}
      {secondaryView === 'department' && filters.department !== 'all' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Purchasers
            <span className="text-sm font-normal text-gray-500 ml-2">
              in {cleanDepartmentName(filters.department)}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {Object.entries(kpis.byPurchaser)
              .sort(([, a], [, b]) => b.amount - a.amount)
              .map(([purchaser, data]) => (
                <KPICard
                  key={purchaser}
                  title={purchaser}
                  value={formatCurrency(data.amount)}
                  subtitle={`${data.count} transactions`}
                  size="small"
                  onClick={() => handlePurchaserClick(purchaser)}
                  isActive={filters.purchaser === purchaser}
                  bgColor={filters.purchaser === purchaser ? 'bg-purple-50' : 'bg-white'}
                />
              ))}
          </div>
        </div>
      )}

      {/* Fourth Layer - Shows Vendors when both Department and Purchaser are selected */}
      {secondaryView === 'department' && filters.department !== 'all' && filters.purchaser !== 'all' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Vendors
            <span className="text-sm font-normal text-gray-500 ml-2">
              for {filters.purchaser} in {cleanDepartmentName(filters.department)}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {Object.entries(kpis.byVendor)
              .sort(([, a], [, b]) => b.amount - a.amount)
              .slice(0, 40)
              .map(([vendor, data]) => (
                <KPICard
                  key={vendor}
                  title={vendor}
                  value={formatCurrency(data.amount)}
                  subtitle={`${data.count} transactions`}
                  size="small"
                  onClick={() => handleVendorClick(vendor)}
                  isActive={filters.vendor === vendor}
                  bgColor={filters.vendor === vendor ? 'bg-indigo-50' : 'bg-white'}
                />
              ))}
          </div>
        </div>
      )}

      {/* Third Layer - Shows Vendors when a Purchaser is selected */}
      {secondaryView === 'purchaser' && filters.purchaser !== 'all' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Vendors
            <span className="text-sm font-normal text-gray-500 ml-2">
              for {filters.purchaser}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {Object.entries(kpis.byVendor)
              .sort(([, a], [, b]) => b.amount - a.amount)
              .slice(0, 40)
              .map(([vendor, data]) => (
                <KPICard
                  key={vendor}
                  title={vendor}
                  value={formatCurrency(data.amount)}
                  subtitle={`${data.count} transactions`}
                  size="small"
                  onClick={() => handleVendorClick(vendor)}
                  isActive={filters.vendor === vendor}
                  bgColor={filters.vendor === vendor ? 'bg-indigo-50' : 'bg-white'}
                />
              ))}
          </div>
        </div>
      )}

      {/* Third Layer - Shows Departments when a Vendor is selected */}
      {secondaryView === 'vendor' && filters.vendor !== 'all' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Departments
            <span className="text-sm font-normal text-gray-500 ml-2">
              for {filters.vendor}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {Object.entries(kpis.byDepartment)
              .sort(([, a], [, b]) => b.amount - a.amount)
              .map(([department, data]) => (
                <KPICard
                  key={department}
                  title={cleanDepartmentName(department)}
                  value={formatCurrency(data.amount)}
                  subtitle={`${data.count} transactions`}
                  size="small"
                  onClick={() => handleDepartmentClick(department)}
                  isActive={filters.department === department}
                />
              ))}
          </div>
        </div>
      )}

      {/* Fourth Layer - Shows Purchasers when both Vendor and Department are selected */}
      {secondaryView === 'vendor' && filters.vendor !== 'all' && filters.department !== 'all' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Purchasers
            <span className="text-sm font-normal text-gray-500 ml-2">
              in {cleanDepartmentName(filters.department)} for {filters.vendor}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {Object.entries(kpis.byPurchaser)
              .sort(([, a], [, b]) => b.amount - a.amount)
              .map(([purchaser, data]) => (
                <KPICard
                  key={purchaser}
                  title={purchaser}
                  value={formatCurrency(data.amount)}
                  subtitle={`${data.count} transactions`}
                  size="small"
                  onClick={() => handlePurchaserClick(purchaser)}
                  isActive={filters.purchaser === purchaser}
                  bgColor={filters.purchaser === purchaser ? 'bg-purple-50' : 'bg-white'}
                />
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6">
        <button
          onClick={() => toggleSection('filters')}
          className="flex items-center gap-2 text-lg font-semibold text-gray-700 mb-3 hover:text-gray-900 transition-colors"
        >
          <svg 
            className={`w-5 h-5 transition-transform duration-200 ${sectionsCollapsed.filters ? '-rotate-90' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Filters
        </button>
        {!sectionsCollapsed.filters && (
        <FilterBar 
          vendors={vendors}
          purchasers={purchasers}
          statuses={uniqueStatuses}
          onFilterChange={handleFilterChange}
          currentFilters={filters}
        />
        )}
      </div>

      {/* Expense Table */}
      <ExpenseTable 
        expenses={filteredExpenses}
        onFlagUpdate={handleFlagUpdate}
        onApprovalUpdate={handleApprovalUpdate}
        isAdmin={isAdmin}
        isMasquerading={isMasquerading}
      />
      </>
      )}

      {/* Trends Tab */}
      {activeTab === 'trends' && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Month Over Month Expense Trends</h2>
            <div className="mb-4 flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">
                  Stack By:
                </label>
                <select
                  value={secondaryView}
                  onChange={(e) => setSecondaryView(e.target.value as any)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="department">Department</option>
                  <option value="purchaser">Purchaser</option>
                  <option value="vendor">Vendor</option>
                  <option value="category">Category</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">
                  From Month:
                </label>
                <input
                  type="month"
                  value={trendsFilters.dateFrom ? trendsFilters.dateFrom.substring(0, 7) : ''}
                  onChange={(e) => {
                    const monthValue = e.target.value;
                    setTrendsFilters(prev => ({ 
                      ...prev, 
                      dateFrom: monthValue ? `${monthValue}-01` : ''
                    }));
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">
                  To Month:
                </label>
                <input
                  type="month"
                  value={trendsFilters.dateTo ? trendsFilters.dateTo.substring(0, 7) : ''}
                  onChange={(e) => {
                    const monthValue = e.target.value;
                    if (monthValue) {
                      // Get last day of the selected month
                      const year = parseInt(monthValue.split('-')[0]);
                      const month = parseInt(monthValue.split('-')[1]);
                      const lastDay = new Date(year, month, 0).getDate();
                      setTrendsFilters(prev => ({ 
                        ...prev, 
                        dateTo: `${monthValue}-${lastDay.toString().padStart(2, '0')}`
                      }));
                    } else {
                      setTrendsFilters(prev => ({ ...prev, dateTo: '' }));
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {(trendsFilters.dateFrom || trendsFilters.dateTo) && (
                <button
                  onClick={() => {
                    setTrendsFilters({ dateFrom: '2025-10-01', dateTo: '' });
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Reset Date Range
                </button>
              )}
            </div>
            
            {/* Chart Container */}
            <div className="w-full h-[400px] mb-4">
              <svg
                viewBox="0 0 1200 500"
                className="w-full h-full"
                style={{ overflow: 'visible' }}
              >
                {(() => {
                  // Group expenses by month and secondaryView dimension
                  const monthlyData: Record<string, Record<string, number>> = {};
                  const allDimensions = new Set<string>();
                  
                  trendsFilteredExpenses.forEach(exp => {
                    const month = exp.transaction_date.substring(0, 7); // YYYY-MM
                    let dimension = '';
                    
                    if (secondaryView === 'department') dimension = exp.department || 'Unknown';
                    else if (secondaryView === 'purchaser') dimension = exp.cardholder || 'Unknown';
                    else if (secondaryView === 'vendor') dimension = exp.vendor_name || 'Unknown';
                    else if (secondaryView === 'category') dimension = exp.category || 'Unknown';
                    
                    if (!monthlyData[month]) monthlyData[month] = {};
                    if (!monthlyData[month][dimension]) monthlyData[month][dimension] = 0;
                    
                    monthlyData[month][dimension] += Number(exp.amount);
                    allDimensions.add(dimension);
                  });
                  
                  // Sort months chronologically
                  const sortedMonths = Object.keys(monthlyData).sort();
                  const dimensionArray = Array.from(allDimensions).sort();
                  
                  // Limit to top 10 dimensions by total amount
                  const dimensionTotals = dimensionArray.map(dim => ({
                    dimension: dim,
                    total: sortedMonths.reduce((sum, month) => sum + (monthlyData[month][dim] || 0), 0)
                  })).sort((a, b) => b.total - a.total).slice(0, 10);
                  
                  const topDimensions = dimensionTotals.map(d => d.dimension);
                  
                  if (sortedMonths.length === 0) {
                    return (
                      <text x="500" y="200" textAnchor="middle" fill="#6B7280" fontSize="16">
                        No data available for the selected date range
                      </text>
                    );
                  }
                  
                  // Chart dimensions
                  const chartWidth = 1200;
                  const chartHeight = 500;
                  const padding = { left: 80, right: 200, top: 20, bottom: 60 };
                  
                  // Calculate scales
                  const maxTotal = Math.max(...sortedMonths.map(month => 
                    topDimensions.reduce((sum, dim) => sum + (monthlyData[month][dim] || 0), 0)
                  ));
                  
                  const xScale = (index: number) => {
                    if (sortedMonths.length === 1) {
                      return padding.left + (chartWidth - padding.left - padding.right) / 2;
                    }
                    return padding.left + (index / (sortedMonths.length - 1)) * (chartWidth - padding.left - padding.right);
                  };
                  const yScale = (value: number) => 
                    chartHeight - padding.bottom - ((value / maxTotal) * (chartHeight - padding.top - padding.bottom));
                  
                  // Color palette
                  const colors = [
                    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
                  ];
                  
                  // Create stacked areas
                  const areas = topDimensions.map((dimension, dimIndex) => {
                    const points = sortedMonths.map((month, monthIndex) => {
                      // Calculate cumulative height up to this dimension
                      const cumulativeBelow = topDimensions.slice(0, dimIndex).reduce(
                        (sum, d) => sum + (monthlyData[month][d] || 0), 0
                      );
                      const cumulativeCurrent = cumulativeBelow + (monthlyData[month][dimension] || 0);
                      
                      return {
                        x: xScale(monthIndex),
                        yBottom: yScale(cumulativeBelow),
                        yTop: yScale(cumulativeCurrent),
                        month,
                        value: monthlyData[month][dimension] || 0
                      };
                    });
                    
                    // Create path for stacked area
                    const topPath = points.map((p, i) => 
                      `${i === 0 ? 'M' : 'L'} ${p.x},${p.yTop}`
                    ).join(' ');
                    
                    const bottomPath = points.map((p, i) => 
                      `${i === 0 ? 'L' : 'L'} ${p.x},${p.yBottom}`
                    ).reverse().join(' ');
                    
                    return (
                      <g key={dimension}>
                        <path
                          d={`${topPath} ${bottomPath} Z`}
                          fill={colors[dimIndex % colors.length]}
                          opacity="0.7"
                          stroke={colors[dimIndex % colors.length]}
                          strokeWidth="2"
                        />
                      </g>
                    );
                  });
                  
                  return (
                    <>
                      {/* Y-axis */}
                      <line
                        x1={padding.left}
                        y1={padding.top}
                        x2={padding.left}
                        y2={chartHeight - padding.bottom}
                        stroke="#E5E7EB"
                        strokeWidth="2"
                      />
                      
                      {/* X-axis */}
                      <line
                        x1={padding.left}
                        y1={chartHeight - padding.bottom}
                        x2={chartWidth - padding.right}
                        y2={chartHeight - padding.bottom}
                        stroke="#E5E7EB"
                        strokeWidth="2"
                      />
                      
                      {/* Y-axis labels */}
                      {[0, 0.25, 0.5, 0.75, 1].map(percent => {
                        const value = maxTotal * percent;
                        return (
                          <g key={percent}>
                            <line
                              x1={padding.left - 5}
                              y1={yScale(value)}
                              x2={padding.left}
                              y2={yScale(value)}
                              stroke="#9CA3AF"
                              strokeWidth="1"
                            />
                            <text
                              x={padding.left - 10}
                              y={yScale(value)}
                              textAnchor="end"
                              dominantBaseline="middle"
                              fill="#6B7280"
                              fontSize="12"
                            >
                              ${(value / 1000).toFixed(0)}k
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* X-axis labels */}
                      {sortedMonths.map((month, i) => {
                        const date = new Date(month + '-01');
                        const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                        return (
                          <text
                            key={month}
                            x={xScale(i)}
                            y={chartHeight - padding.bottom + 20}
                            textAnchor="middle"
                            fill="#6B7280"
                            fontSize="12"
                          >
                            {label}
                          </text>
                        );
                      })}
                      
                      {/* Stacked areas */}
                      {areas}
                      
                      {/* Legend */}
                      {topDimensions.map((dimension, i) => (
                        <g key={dimension} transform={`translate(${chartWidth - padding.right + 20}, ${chartHeight / 2 - (topDimensions.length * 25) / 2 + i * 25})`}>
                          <rect
                            x="0"
                            y="0"
                            width="15"
                            height="15"
                            fill={colors[i % colors.length]}
                            opacity="0.7"
                          />
                          <text
                            x="20"
                            y="12"
                            fill="#374151"
                            fontSize="13"
                          >
                            {dimension.length > 20 ? dimension.substring(0, 20) + '...' : dimension}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">Total Expenses</h3>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(trendsFilteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0))}
              </p>
              <p className="text-xs text-gray-500 mt-1">{trendsFilteredExpenses.length} transactions</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">Avg per Month</h3>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(
                  trendsFilteredExpenses.length > 0
                    ? trendsFilteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0) / 
                      new Set(trendsFilteredExpenses.map(e => e.transaction_date.substring(0, 7))).size
                    : 0
                )}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">Time Range</h3>
              <p className="text-base font-semibold text-gray-900">
                {trendsFilteredExpenses.length > 0
                  ? `${new Date(Math.min(...trendsFilteredExpenses.map(e => new Date(e.transaction_date).getTime()))).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(Math.max(...trendsFilteredExpenses.map(e => new Date(e.transaction_date).getTime()))).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                  : 'No data'
                }
              </p>
            </div>
          </div>

          {/* Summary Table by Stack Selection */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Breakdown by {
                secondaryView === 'department' ? 'Department' :
                secondaryView === 'purchaser' ? 'Purchaser' :
                secondaryView === 'vendor' ? 'Vendor' :
                'Category'
              }
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {
                        secondaryView === 'department' ? 'Department' :
                        secondaryView === 'purchaser' ? 'Purchaser' :
                        secondaryView === 'vendor' ? 'Vendor' :
                        'Category'
                      }
                    </th>
                    {(() => {
                      // Get unique months from filtered expenses
                      const months = Array.from(new Set(
                        trendsFilteredExpenses.map(e => e.transaction_date.substring(0, 7))
                      )).sort();
                      
                      return months.map(month => {
                        const date = new Date(month + '-01');
                        const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                        return (
                          <th key={month} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {label}
                          </th>
                        );
                      });
                    })()}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(() => {
                    // Group data by dimension and month
                    const dimensionData: Record<string, {
                      byMonth: Record<string, number>;
                      total: number;
                      count: number;
                    }> = {};
                    
                    trendsFilteredExpenses.forEach(exp => {
                      let dimension = '';
                      if (secondaryView === 'department') dimension = exp.department || 'Unknown';
                      else if (secondaryView === 'purchaser') dimension = exp.cardholder || 'Unknown';
                      else if (secondaryView === 'vendor') dimension = exp.vendor_name || 'Unknown';
                      else if (secondaryView === 'category') dimension = exp.category || 'Unknown';
                      
                      const month = exp.transaction_date.substring(0, 7);
                      
                      if (!dimensionData[dimension]) {
                        dimensionData[dimension] = {
                          byMonth: {},
                          total: 0,
                          count: 0
                        };
                      }
                      
                      if (!dimensionData[dimension].byMonth[month]) {
                        dimensionData[dimension].byMonth[month] = 0;
                      }
                      
                      dimensionData[dimension].byMonth[month] += Number(exp.amount);
                      dimensionData[dimension].total += Number(exp.amount);
                      dimensionData[dimension].count += 1;
                    });
                    
                    // Get unique months for column headers
                    const months = Array.from(new Set(
                      trendsFilteredExpenses.map(e => e.transaction_date.substring(0, 7))
                    )).sort();
                    
                    // Sort dimensions by total amount
                    const sortedDimensions = Object.entries(dimensionData)
                      .sort(([, a], [, b]) => b.total - a.total);
                    
                    if (sortedDimensions.length === 0) {
                      return (
                        <tr>
                          <td colSpan={months.length + 3} className="px-4 py-8 text-center text-gray-500">
                            No data available for the selected date range
                          </td>
                        </tr>
                      );
                    }
                    
                    return sortedDimensions.map(([dimension, data]) => (
                      <tr key={dimension} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {dimension}
                        </td>
                        {months.map(month => (
                          <td key={month} className="px-4 py-3 text-sm text-right text-gray-700">
                            {data.byMonth[month] ? formatCurrency(data.byMonth[month]) : '-'}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                          {formatCurrency(data.total)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {data.count}
                        </td>
                      </tr>
                    ));
                  })()}
                  {/* Total Row */}
                  {(() => {
                    const months = Array.from(new Set(
                      trendsFilteredExpenses.map(e => e.transaction_date.substring(0, 7))
                    )).sort();
                    
                    const monthTotals: Record<string, number> = {};
                    trendsFilteredExpenses.forEach(exp => {
                      const month = exp.transaction_date.substring(0, 7);
                      if (!monthTotals[month]) monthTotals[month] = 0;
                      monthTotals[month] += Number(exp.amount);
                    });
                    
                    const grandTotal = trendsFilteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
                    const totalCount = trendsFilteredExpenses.length;
                    
                    if (months.length === 0) return null;
                    
                    return (
                      <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Total
                        </td>
                        {months.map(month => (
                          <td key={month} className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(monthTotals[month] || 0)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatCurrency(grandTotal)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {totalCount}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}