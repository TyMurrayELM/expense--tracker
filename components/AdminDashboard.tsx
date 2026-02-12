'use client';

import { useState, useEffect } from 'react';
import { UserWithPermissions } from '@/types/user';
import SlackSyncButton from './SlackSyncButton';
import AutoCreateUsersButton from './AutoCreateUsersButton';

interface AdminDashboardProps {
  availableBranches: string[];
  availableDepartments: string[];
  onUsersChange?: () => void;
}

export default function AdminDashboard({ availableBranches, availableDepartments, onUsersChange }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserWithPermissions | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for creating/editing users
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    is_admin: false,
    is_active: true,
    branches: [] as string[],
    departments: [] as string[],
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users');
      const data = await response.json();

      if (data.success) {
        setUsers(data.users);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.email || !formData.full_name) {
      alert('Email and full name are required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setUsers([...users, data.user]);
        setShowCreateModal(false);
        resetForm();
        if (onUsersChange) onUsersChange();
      } else {
        alert(`Failed to create user: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setUsers(users.map(u => u.id === editingUser.id ? data.user : u));
        setEditingUser(null);
        resetForm();
        if (onUsersChange) onUsersChange();
      } else {
        alert(`Failed to update user: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setUsers(users.filter(u => u.id !== userId));
        if (onUsersChange) onUsersChange();
      } else {
        alert(`Failed to delete user: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      is_admin: false,
      is_active: true,
      branches: [],
      departments: [],
    });
  };

  const openEditModal = (user: UserWithPermissions) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
      is_active: user.is_active,
      branches: user.branches,
      departments: user.departments,
    });
  };

  const toggleBranch = (branch: string) => {
    setFormData(prev => ({
      ...prev,
      branches: prev.branches.includes(branch)
        ? prev.branches.filter(b => b !== branch)
        : [...prev.branches, branch],
    }));
  };

  const toggleDepartment = (department: string) => {
    setFormData(prev => ({
      ...prev,
      departments: prev.departments.includes(department)
        ? prev.departments.filter(d => d !== department)
        : [...prev.departments, department],
    }));
  };

  const selectAllBranches = () => {
    setFormData(prev => ({
      ...prev,
      branches: prev.branches.length === availableBranches.length ? [] : [...availableBranches],
    }));
  };

  const selectAllDepartments = () => {
    setFormData(prev => ({
      ...prev,
      departments: prev.departments.length === availableDepartments.length ? [] : [...availableDepartments],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-700">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-700 mt-1">
            Manage user access to branches and departments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AutoCreateUsersButton onComplete={fetchUsers} />
          <SlackSyncButton onSyncComplete={fetchUsers} />
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add User
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Slack
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Branches
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Departments
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {user.full_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-700">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.slack_id ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                          </svg>
                          {user.slack_display_name || 'Linked'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-700">Not linked</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.is_admin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">
                      {user.is_admin ? (
                        <span className="italic">All branches</span>
                      ) : user.branches.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.branches.map(branch => (
                            <span 
                              key={branch} 
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                                branch === 'Phoenix - North' ? 'bg-green-100 text-green-800' :
                                branch === 'Phoenix - SouthEast' ? 'bg-red-100 text-red-800' :
                                branch === 'Phoenix - SouthWest' ? 'bg-blue-100 text-blue-800' :
                                branch === 'Las Vegas' ? 'bg-yellow-100 text-yellow-800' :
                                branch === 'Corporate' ? 'bg-gray-100 text-gray-800' :
                                'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {branch}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-700">No access</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">
                      {user.is_admin ? (
                        <span className="italic">All departments</span>
                      ) : user.departments.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.departments.map(dept => (
                            <span key={dept} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
                              {dept}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-700">No restrictions</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => openEditModal(user)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingUser}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="user@encorelm.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                />
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_admin}
                    onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Admin</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>

              {!formData.is_admin && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Branch Access
                      </label>
                      <button
                        type="button"
                        onClick={selectAllBranches}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {formData.branches.length === availableBranches.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 rounded-md max-h-40 overflow-y-auto">
                      {availableBranches.map(branch => (
                        <label key={branch} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.branches.includes(branch)}
                            onChange={() => toggleBranch(branch)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-gray-700">{branch}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-700 mt-1">
                      Leave empty for no access
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Department Restrictions
                      </label>
                      <button
                        type="button"
                        onClick={selectAllDepartments}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {formData.departments.length === availableDepartments.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3 border border-gray-300 rounded-md max-h-40 overflow-y-auto">
                      {availableDepartments.map(department => (
                        <label key={department} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.departments.includes(department)}
                            onChange={() => toggleDepartment(department)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-gray-700">{department}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-700 mt-1">
                      Leave empty for no department restrictions
                    </p>
                  </div>
                </>
              )}

              {formData.is_admin && (
                <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                  <p className="text-sm text-purple-800">
                    <strong>Admin users</strong> have access to all branches and departments automatically.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingUser(null);
                  resetForm();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingUser ? handleUpdateUser : handleCreateUser}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                {saving ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
