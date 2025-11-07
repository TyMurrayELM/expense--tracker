'use client';

import { useState, useMemo, useEffect } from 'react';
import { Expense } from '@/types/expense';
import { UserWithPermissions } from '@/types/user';
import Header from './Header';
import ExpenseDashboard from './ExpenseDashboard';
import AdminDashboard from './AdminDashboard';

interface PageWrapperProps {
  initialExpenses: Expense[];
  vendors: string[];
  purchasers: string[];
  currentUser: UserWithPermissions; // The actual logged-in user
}

export default function PageWrapper({ initialExpenses, vendors, purchasers, currentUser }: PageWrapperProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trends' | 'admin'>('dashboard');
  const [masqueradingAsUser, setMasqueradingAsUser] = useState<UserWithPermissions | null>(null);
  const [allUsers, setAllUsers] = useState<UserWithPermissions[]>([]);

  // Fetch users for masquerading dropdown (only if current user is admin)
  useEffect(() => {
    if (currentUser.is_admin) {
      fetchUsers();
    }
  }, [currentUser.is_admin]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (data.success) {
        setAllUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  // Determine which user's permissions to apply
  const effectiveUser = masqueradingAsUser || currentUser;

  // Get available branches and departments from expenses
  const availableBranches = useMemo(() => {
    const branches = new Set(
      initialExpenses
        .map(e => e.branch)
        .filter((branch): branch is string => branch !== null && branch !== undefined && branch !== '')
    );
    return Array.from(branches).sort();
  }, [initialExpenses]);

  const availableDepartments = useMemo(() => {
    const departments = new Set(
      initialExpenses
        .map(e => e.department)
        .filter((dept): dept is string => dept !== null && dept !== undefined && dept !== '')
    );
    return Array.from(departments).sort();
  }, [initialExpenses]);

  // Filter expenses based on effective user permissions
  const filteredExpenses = useMemo(() => {
    console.log('=== FILTERING EXPENSES ===');
    console.log('Effective User:', effectiveUser.full_name);
    console.log('Is Admin:', effectiveUser.is_admin);
    console.log('Branches:', effectiveUser.branches);
    console.log('Departments:', effectiveUser.departments);
    console.log('Masquerading:', masqueradingAsUser ? 'YES' : 'NO');
    
    // If effective user is admin, show all
    if (effectiveUser.is_admin) {
      console.log('Admin user - showing all', initialExpenses.length, 'expenses');
      return initialExpenses;
    }

    // Filter based on user permissions
    const filtered = initialExpenses.filter(expense => {
      // Check branch access
      if (effectiveUser.branches.length > 0) {
        if (!expense.branch || !effectiveUser.branches.includes(expense.branch)) {
          return false;
        }
      }

      // Check department access
      if (effectiveUser.departments.length > 0) {
        if (!expense.department || !effectiveUser.departments.includes(expense.department)) {
          return false;
        }
      }

      return true;
    });
    
    console.log('Filtered to', filtered.length, 'expenses');
    console.log('=== END FILTERING ===');
    return filtered;
  }, [initialExpenses, effectiveUser, masqueradingAsUser]);

  // Check if user has no permissions (new user scenario)
  const hasNoPermissions = !effectiveUser.is_admin && 
    effectiveUser.branches.length === 0 && 
    effectiveUser.departments.length === 0;

  // Filter vendors and purchasers based on visible expenses
  const filteredVendors = useMemo(() => {
    if (effectiveUser.is_admin && !masqueradingAsUser) return vendors;
    const vendorSet = new Set(filteredExpenses.map(e => e.vendor_name));
    return vendors.filter(v => vendorSet.has(v));
  }, [vendors, filteredExpenses, effectiveUser, masqueradingAsUser]);

  const filteredPurchasers = useMemo(() => {
    if (effectiveUser.is_admin && !masqueradingAsUser) return purchasers;
    const purchaserSet = new Set(filteredExpenses.map(e => e.cardholder).filter(Boolean));
    return purchasers.filter(p => purchaserSet.has(p));
  }, [purchasers, filteredExpenses, effectiveUser, masqueradingAsUser]);

  return (
    <div className="min-h-screen bg-blue-50">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        currentUser={currentUser}
        masqueradingAsUser={masqueradingAsUser}
        onMasqueradeChange={setMasqueradingAsUser}
        allUsers={allUsers}
      />

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {hasNoPermissions ? (
          // Welcome screen for users with no permissions (or masquerading as one)
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center max-w-2xl mx-auto">
            <div className="text-6xl mb-4">👋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {masqueradingAsUser ? `Viewing as: ${effectiveUser.full_name}` : 'Welcome to Expense Tracker!'}
            </h2>
            <p className="text-gray-600 mb-6">
              {masqueradingAsUser 
                ? `${effectiveUser.full_name} does not have access to any data yet.`
                : 'Your account has been created, but you don\'t have access to any data yet.'
              }
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900">
                <strong>Next steps:</strong> An administrator needs to grant {masqueradingAsUser ? 'this user' : 'you'} access to specific branches and departments.
              </p>
            </div>
            {!masqueradingAsUser && (
              <p className="text-sm text-gray-500">
                Please contact your administrator to request access.
              </p>
            )}
          </div>
        ) : activeTab === 'admin' ? (
          currentUser.is_admin ? (
            <AdminDashboard 
              availableBranches={availableBranches}
              availableDepartments={availableDepartments}
              onUsersChange={fetchUsers}
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-600">You need administrator privileges to access this page.</p>
            </div>
          )
        ) : (
          <ExpenseDashboard
            initialExpenses={filteredExpenses}
            vendors={filteredVendors}
            purchasers={filteredPurchasers}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isAdmin={currentUser.is_admin}
            isMasquerading={masqueradingAsUser !== null}
          />
        )}
      </main>
    </div>
  );
}