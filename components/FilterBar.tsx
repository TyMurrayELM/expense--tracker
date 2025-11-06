'use client';

import { useState } from 'react';

interface FilterBarProps {
  vendors: string[];
  purchasers: string[];
  statuses: string[];
  onFilterChange: (key: string, value: string) => void;
  currentFilters: {
    branch: string;
    vendor: string;
    department: string;
    purchaser: string;
    showFlagged: string;
    transactionType: string;
    status: string;
  };
}

export default function FilterBar({ vendors, purchasers, statuses, onFilterChange, currentFilters }: FilterBarProps) {
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
          <select 
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currentFilters.purchaser}
            onChange={(e) => onFilterChange('purchaser', e.target.value)}
          >
            <option value="all">All Purchasers</option>
            {purchasers.map(purchaser => (
              <option key={purchaser} value={purchaser}>{purchaser}</option>
            ))}
          </select>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
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
      </div>
    </div>
  );
}
