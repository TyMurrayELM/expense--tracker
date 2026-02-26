'use client';

import { useState, useRef, useEffect } from 'react';
import { FLAG_CATEGORIES } from '@/types/expense';

interface MultiSelectOption {
  value: string;
  label: string;
}

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const displayText = selected.length === 0
    ? placeholder
    : selected.length === 1
    ? options.find(o => o.value === selected[0])?.label ?? selected[0]
    : `${selected.length} selected`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border rounded-md px-3 py-2 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between ${
          selected.length > 0 ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-300'
        }`}
      >
        <span className={selected.length === 0 ? 'text-gray-500' : 'text-gray-900 truncate'}>
          {displayText}
        </span>
        <svg className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${selected.length > 0 ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 text-left border-b border-gray-200"
            >
              Clear all
            </button>
          )}
          {options.map(option => (
            <label
              key={option.value}
              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggleOption(option.value)}
                className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterBarProps {
  vendors: string[];
  purchasers: string[];
  categories: string[];
  statuses: string[];
  onFilterChange: (key: string, value: string | string[]) => void;
  currentFilters: {
    branch: string;
    vendor: string;
    department: string;
    purchaser: string[];
    category: string[];
    showFlagged: string;
    flagCategory: string[];
    transactionType: string;
    status: string;
    approvalStatus: string[];
    syncStatus: string;
  };
}

export default function FilterBar({ vendors, purchasers, categories, statuses, onFilterChange, currentFilters }: FilterBarProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currentFilters.vendor}
            onChange={(e) => onFilterChange('vendor', e.target.value)}
          >
            <option value="all">All Vendors</option>
            {vendors.map(vendor => (
              <option key={vendor} value={vendor}>{vendor}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Purchaser</label>
          <MultiSelectDropdown
            options={purchasers.map(p => ({ value: p, label: p }))}
            selected={currentFilters.purchaser}
            onChange={(values) => onFilterChange('purchaser', values)}
            placeholder="All Purchasers"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <MultiSelectDropdown
            options={categories.map(c => ({ value: c, label: c }))}
            selected={currentFilters.category}
            onChange={(values) => onFilterChange('category', values)}
            placeholder="All Categories"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Show Flagged</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currentFilters.showFlagged}
            onChange={(e) => onFilterChange('showFlagged', e.target.value)}
          >
            <option value="all">All Transactions</option>
            <option value="flagged">Flagged Only</option>
            <option value="unflagged">Unflagged Only</option>
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Flag Type</label>
          <MultiSelectDropdown
            options={FLAG_CATEGORIES.map(c => ({ value: c, label: c }))}
            selected={currentFilters.flagCategory}
            onChange={(values) => onFilterChange('flagCategory', values)}
            placeholder="All Flag Types"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currentFilters.transactionType}
            onChange={(e) => onFilterChange('transactionType', e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="Vendor Bill">Vendor Bills</option>
            <option value="Credit Card">Credit Cards</option>
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Approval Status</label>
          <MultiSelectDropdown
            options={[
              { value: 'pending', label: 'Pending Review' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            selected={currentFilters.approvalStatus}
            onChange={(values) => onFilterChange('approvalStatus', values)}
            placeholder="All Approval States"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Completion Status</label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currentFilters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
          >
            <option value="all">All Statuses</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sync Status
            <span className="text-xs text-gray-700 ml-1">(Credit Cards)</span>
          </label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currentFilters.syncStatus}
            onChange={(e) => onFilterChange('syncStatus', e.target.value)}
          >
            <option value="all">All Sync States</option>
            <option value="synced">Synced to NetSuite</option>
            <option value="not-synced">Not Synced</option>
          </select>
        </div>
      </div>
    </div>
  );
}
