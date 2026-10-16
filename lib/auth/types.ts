export type UserRole = 'admin' | 'member' | 'user';
export type UserStatus = 'active' | 'pending' | 'blocked';

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  role: UserRole;
  status: UserStatus;
  dailyQuota: number;
  usageCount: number;
  remainingQuota: number;
  lastLogin?: string;
  idToken?: string;
  isOfflineFallback?: boolean;
}

export interface GoogleAuthResponse {
  ok: boolean;
  user?: AuthUser;
  error?: string;
  message?: string;
  status?: UserStatus;
}
