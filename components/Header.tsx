'use client';

import { signOut } from 'next-auth/react';
import SyncButton from '@/components/SyncButton';
import { UserWithPermissions } from '@/types/user';
import { useState, useEffect } from 'react';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileUserMenuOpen, setMobileUserMenuOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const dropdown = document.getElementById('user-dropdown');
      const dropdownMobile = document.getElementById('user-dropdown-mobile');
      const button = dropdown?.previousElementSibling;
      const buttonMobile = dropdownMobile?.previousElementSibling;

      if (dropdown && !dropdown.contains(e.target as Node) && !button?.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (dropdownMobile && !dropdownMobile.contains(e.target as Node) && !buttonMobile?.contains(e.target as Node)) {
        setMobileUserMenuOpen(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const initials = currentUser.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header style={{ background: 'linear-gradient(to right, #003264, #32CDFF)' }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        {/* Desktop Layout */}
        <div className="hidden lg:flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            {/* Logo / Title */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-white tracking-tight">Expense Tracker</h1>
            </div>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1">
              <button
                onClick={() => onTabChange('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'dashboard'
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Expenses
              </button>
              <button
                onClick={() => onTabChange('trends')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'trends'
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Trends
              </button>
              {currentUser.is_admin && (
                <button
                  onClick={() => onTabChange('admin')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === 'admin'
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Admin
                </button>
              )}
            </nav>

            {/* Divider */}
            <div className="w-px h-8 bg-white/20" />

            {/* View As Dropdown (Admin only) */}
            {currentUser.is_admin && allUsers.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-white/80 uppercase tracking-wider">View As</label>
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
                  className="bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent max-w-[200px] [&>option]:text-gray-900"
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
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-400/30 rounded-lg">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-medium text-white">
                  Viewing as: {masqueradingAsUser.full_name}
                </span>
                <button
                  onClick={() => onMasqueradeChange(null)}
                  className="text-white hover:text-white ml-1 transition-colors"
                  title="Exit masquerade mode"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <SyncButton currentUser={currentUser} />
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg hover:bg-white/10 transition-all duration-200"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold text-xs ring-2 ring-white/20">
                  {initials}
                </div>
                <div className="text-left hidden xl:block">
                  <div className="text-sm font-medium text-white leading-tight">{currentUser.full_name}</div>
                  {currentUser.is_admin && (
                    <div className="text-[10px] text-white/80 font-medium uppercase tracking-wider">Admin</div>
                  )}
                </div>
                <svg className={`w-4 h-4 text-white/80 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div
                  id="user-dropdown"
                  className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold shadow-sm">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{currentUser.full_name}</div>
                        <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
                      </div>
                    </div>
                    {currentUser.is_admin && (
                      <div className="mt-2.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 uppercase tracking-wider">
                        Administrator
                      </div>
                    )}
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut({ callbackUrl: '/auth/signin' });
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-base font-semibold text-white">Expense Tracker</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileUserMenuOpen(!mobileUserMenuOpen)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold text-xs ring-2 ring-white/20"
              >
                {initials}
              </button>

              {/* Mobile User Dropdown */}
              {mobileUserMenuOpen && (
                <div
                  id="user-dropdown-mobile"
                  className="absolute top-14 right-4 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 py-1 z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold shadow-sm">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{currentUser.full_name}</div>
                        <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
                      </div>
                    </div>
                    {currentUser.is_admin && (
                      <div className="mt-2.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 uppercase tracking-wider">
                        Administrator
                      </div>
                    )}
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setMobileUserMenuOpen(false);
                        signOut({ callbackUrl: '/auth/signin' });
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile Menu Panel */}
          {mobileMenuOpen && (
            <div className="pb-4 pt-2 space-y-3 border-t border-white/10">
              {/* Tab Navigation */}
              <nav className="flex flex-col gap-1">
                <button
                  onClick={() => {
                    onTabChange('dashboard');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                    activeTab === 'dashboard'
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Expenses
                </button>
                <button
                  onClick={() => {
                    onTabChange('trends');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                    activeTab === 'trends'
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Trends
                </button>
                {currentUser.is_admin && (
                  <button
                    onClick={() => {
                      onTabChange('admin');
                      setMobileMenuOpen(false);
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      activeTab === 'admin'
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    Admin
                  </button>
                )}
              </nav>

              {/* View As Dropdown (Admin only - Mobile) */}
              {currentUser.is_admin && allUsers.length > 0 && (
                <div className="px-4 space-y-1.5">
                  <label className="text-xs font-medium text-white/80 uppercase tracking-wider">View As</label>
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
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400 [&>option]:text-gray-900"
                  >
                    <option value="">My View (Admin)</option>
                    {allUsers
                      .filter(u => !u.is_admin && u.id !== currentUser.id)
                      .sort((a, b) => a.full_name.localeCompare(b.full_name))
                      .map(user => (
                        <option key={user.id} value={user.id}>
                          {user.full_name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Masquerading Indicator (Mobile) */}
              {masqueradingAsUser && (
                <div className="mx-4 flex items-center gap-2 px-3 py-2 bg-amber-500/20 border border-amber-400/30 rounded-lg">
                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-medium text-white flex-1">
                    Viewing as: {masqueradingAsUser.full_name}
                  </span>
                  <button
                    onClick={() => onMasqueradeChange(null)}
                    className="text-white hover:text-white transition-colors"
                    title="Exit masquerade mode"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Sync Button (Mobile) */}
              <div className="px-4 pt-1">
                <SyncButton currentUser={currentUser} />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
