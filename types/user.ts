// types/user.ts
export interface User {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  is_active: boolean;
  slack_id?: string | null;
  slack_display_name?: string | null;
  slack_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserBranchPermission {
  id: string;
  user_id: string;
  branch_name: string;
  created_at: string;
}

export interface UserDepartmentPermission {
  id: string;
  user_id: string;
  department_name: string;
  created_at: string;
}

export interface UserWithPermissions extends User {
  branches: string[];
  departments: string[];
}

export interface CreateUserRequest {
  email: string;
  full_name: string;
  is_admin: boolean;
  branches: string[];
  departments: string[];
}

export interface UpdateUserRequest {
  full_name?: string;
  is_admin?: boolean;
  is_active?: boolean;
  branches?: string[];
  departments?: string[];
}

export interface SlackSyncStats {
  total: number;
  matched: number;
  updated: number;
  created: number;
  notFound: number;
}

export interface SlackSyncResponse {
  success: boolean;
  message: string;
  stats: SlackSyncStats;
  errors?: string[];
}
