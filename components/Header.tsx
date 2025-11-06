'use client';

import { signOut } from 'next-auth/react';
import SyncButton from '@/components/SyncButton';
import { UserWithPermissions } from '@/types/user';

interface HeaderProps {
  activeTab: 'dashboard' | 'trends' | 'admin';
  onTabChange: (tab: 'dashboard' | 'trends' | 'admin') => void;
  currentUser: UserWithPermissions;
  masqueradingAsUser: UserWithPermissions | null;
  onMasqueradeChange: (user: UserWithPermissions | null) => void;
  allUsers: UserWithPermissions[];
}

export default function Header({ 
  activeTab, 
  onTabChange,
  currentUser,
  masqueradingAsUser, 
  onMasqueradeChange,
  allUsers 
}: HeaderProps) {
  // Determine effective user for permission checks
  const effectiveUser = masqueradingAsUser || currentUser;

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-gray-900">Expense Tracker</h1>
            
            {/* Tab Navigation */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-1 inline-flex gap-1">
              <button
                onClick={() => onTabChange('dashboard')}
                className={`${
                  activeTab === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                } px-6 py-2 rounded-md font-medium text-sm transition-all duration-200 ease-in-out`}
              >
                Expenses
              </button>
              <button
                onClick={() => onTabChange('trends')}
                className={`${
                  activeTab === 'trends'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                } px-6 py-2 rounded-md font-medium text-sm transition-all duration-200 ease-in-out`}
              >
                Trends
              </button>
              {currentUser.is_admin && (
                <button
                  onClick={() => onTabChange('admin')}
                  className={`${
                    activeTab === 'admin'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                  } px-6 py-2 rounded-md font-medium text-sm transition-all duration-200 ease-in-out`}
                >
                  Admin
                </button>
              )}
            </div>

            {/* View As Dropdown (Admin only) */}
            {currentUser.is_admin && allUsers.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">View As:</label>
                <select
                  value={masqueradingAsUser?.id || ''}
                  onChange={(e) => {
                    const userId = e.target.value;
                    if (userId === '') {
                      onMasqueradeChange(null);
                    } else {
                      const user = allUsers.find(u => u.id === userId);
                      if (user) {
                        onMasqueradeChange(user);
                      }
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">My View (Admin)</option>
                  {allUsers
                    .filter(u => !u.is_admin && u.id !== currentUser.id)
                    .sort((a, b) => a.full_name.localeCompare(b.full_name))
                    .map(user => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} ({user.email})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Masquerading Indicator */}
            {masqueradingAsUser && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 border border-orange-300 rounded-md">
                <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-medium text-orange-800">
                  Viewing as: {masqueradingAsUser.full_name}
                </span>
                <button
                  onClick={() => onMasqueradeChange(null)}
                  className="text-orange-600 hover:text-orange-800 ml-1"
                  title="Exit masquerade mode"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Right side: User info and buttons */}
          <div className="flex items-center gap-4">
            <SyncButton currentUser={effectiveUser} />
            
            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => {
                  const dropdown = document.getElementById('user-dropdown');
                  if (dropdown) {
                    dropdown.classList.toggle('hidden');
                  }
                }}
                className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow"
              >
                {/* User Avatar Circle */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-inner">
                  {currentUser.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                
                {/* User Info */}
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-900">{currentUser.full_name}</div>
                  {currentUser.is_admin && (
                    <div className="text-xs text-blue-600 font-medium">Administrator</div>
                  )}
                </div>
                
                {/* Dropdown Arrow */}
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              <div
                id="user-dropdown"
                className="hidden absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                {/* User Info Section */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold shadow-inner">
                      {currentUser.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{currentUser.full_name}</div>
                      <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
                    </div>
                  </div>
                  {currentUser.is_admin && (
                    <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                      Admin Access
                    </div>
                  )}
                </div>

                {/* Sign Out Button */}
                <button
                  onClick={() => {
                    const dropdown = document.getElementById('user-dropdown');
                    if (dropdown) dropdown.classList.add('hidden');
                    signOut({ callbackUrl: '/auth/signin' });
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Click outside to close dropdown */}
          <style jsx global>{`
            body {
              position: relative;
            }
          `}</style>
          <script dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                document.addEventListener('click', function(e) {
                  const dropdown = document.getElementById('user-dropdown');
                  const button = dropdown?.previousElementSibling;
                  if (dropdown && !dropdown.contains(e.target) && !button?.contains(e.target)) {
                    dropdown.classList.add('hidden');
                  }
                });
              }
            `
          }} />
        </div>
      </div>
    </header>
  );
}
