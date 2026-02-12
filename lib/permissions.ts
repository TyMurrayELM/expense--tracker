/**
 * User Permission Utilities
 *
 * Helper functions for checking and applying user permissions to expense data.
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

