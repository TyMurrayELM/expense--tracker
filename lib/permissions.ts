/**
 * User Permission Utilities
 * 
 * Helper functions for checking and applying user permissions to expense data.
 * Use these when you implement actual authentication.
 */

import { Expense } from '@/types/expense';
import { UserWithPermissions } from '@/types/user';

/**
 * Check if a user has access to a specific branch
 */
export function hasAccessToBranch(user: UserWithPermissions, branchName: string): boolean {
  // Admins have access to everything
  if (user.is_admin) {
    return true;
  }

  // If user has no branch restrictions, they can see all branches
  if (user.branches.length === 0) {
    return true;
  }

  // Check if the branch is in the user's allowed branches
  return user.branches.includes(branchName);
}

/**
 * Check if a user has access to a specific department
 */
export function hasAccessToDepartment(user: UserWithPermissions, departmentName: string): boolean {
  // Admins have access to everything
  if (user.is_admin) {
    return true;
  }

  // If user has no department restrictions, they can see all departments
  if (user.departments.length === 0) {
    return true;
  }

  // Check if the department is in the user's allowed departments
  return user.departments.includes(departmentName);
}

/**
 * Check if a user has access to a specific expense
 */
export function hasAccessToExpense(user: UserWithPermissions, expense: Expense): boolean {
  // Admins have access to everything
  if (user.is_admin) {
    return true;
  }

  // Check branch access (if expense has a branch)
  if (expense.branch) {
    const branchAccess = hasAccessToBranch(user, expense.branch);
    if (!branchAccess) {
      return false;
    }
  }

  // Check department access (if expense has a department)
  if (expense.department) {
    const departmentAccess = hasAccessToDepartment(user, expense.department);
    if (!departmentAccess) {
      return false;
    }
  }

  return true;
}

/**
 * Filter expenses based on user permissions
 */
export function filterExpensesByPermissions(
  expenses: Expense[],
  user: UserWithPermissions
): Expense[] {
  // Admins see everything
  if (user.is_admin) {
    return expenses;
  }

  return expenses.filter(expense => hasAccessToExpense(user, expense));
}

/**
 * Get allowed branches for a user (for filter dropdowns)
 */
export function getAllowedBranches(
  user: UserWithPermissions,
  allBranches: string[]
): string[] {
  // Admins see all branches
  if (user.is_admin) {
    return allBranches;
  }

  // If user has no restrictions, return all branches
  if (user.branches.length === 0) {
    return allBranches;
  }

  // Return only branches the user has access to
  return allBranches.filter(branch => user.branches.includes(branch));
}

/**
 * Get allowed departments for a user (for filter dropdowns)
 */
export function getAllowedDepartments(
  user: UserWithPermissions,
  allDepartments: string[]
): string[] {
  // Admins see all departments
  if (user.is_admin) {
    return allDepartments;
  }

  // If user has no restrictions, return all departments
  if (user.departments.length === 0) {
    return allDepartments;
  }

  // Return only departments the user has access to
  return allDepartments.filter(dept => user.departments.includes(dept));
}

/**
 * Get user by email (for authentication integration)
 */
export async function getUserByEmail(email: string): Promise<UserWithPermissions | null> {
  try {
    const response = await fetch('/api/users');
    const data = await response.json();

    if (data.success) {
      const user = data.users.find((u: UserWithPermissions) => u.email === email);
      return user || null;
    }

    return null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

/**
 * Check if current user is admin
 * This is a placeholder - implement with your auth system
 */
export function isCurrentUserAdmin(): boolean {
  // TODO: Implement with your authentication system
  // For now, return false as a safe default
  return false;
}

/**
 * Get current user from session
 * This is a placeholder - implement with your auth system
 */
export async function getCurrentUser(): Promise<UserWithPermissions | null> {
  // TODO: Implement with your authentication system
  // Example with NextAuth:
  // const session = await getSession();
  // if (session?.user?.email) {
  //   return await getUserByEmail(session.user.email);
  // }
  // return null;
  
  return null;
}

/**
 * Example: How to use in your page.tsx
 * 
 * async function getExpenses() {
 *   // Fetch all expenses from Supabase
 *   const { data, error } = await supabase
 *     .from('expenses')
 *     .select('*')
 *     .gte('transaction_date', '2025-10-01')
 *     .order('transaction_date', { ascending: false });
 * 
 *   if (error) {
 *     console.error('Error fetching expenses:', error);
 *     return [];
 *   }
 * 
 *   // Get current user
 *   const currentUser = await getCurrentUser();
 *   
 *   // If no user or user is not active, return empty array
 *   if (!currentUser || !currentUser.is_active) {
 *     return [];
 *   }
 * 
 *   // Filter expenses based on user permissions
 *   const filteredExpenses = filterExpensesByPermissions(data as Expense[], currentUser);
 *   
 *   return filteredExpenses;
 * }
 */

/**
 * Example: How to filter vendor/purchaser lists based on permissions
 * 
 * async function getFilterOptions(user: UserWithPermissions) {
 *   // Get all expenses (or pre-filtered by user permissions)
 *   const expenses = await getExpenses(); // Already filtered by permissions
 *   
 *   // Extract unique vendors from accessible expenses
 *   const { data: vendorData } = await supabase
 *     .from('expenses')
 *     .select('vendor_name')
 *     .gte('transaction_date', '2025-10-01');
 *   
 *   // Apply permission filter
 *   const accessibleVendors = vendorData
 *     ?.filter(v => {
 *       const expense = expenses.find(e => e.vendor_name === v.vendor_name);
 *       return expense && hasAccessToExpense(user, expense);
 *     })
 *     .map(d => d.vendor_name);
 *   
 *   const vendors = [...new Set(accessibleVendors || [])];
 *   
 *   return { vendors };
 * }
 */
