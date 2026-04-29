export type UserRole = 'admin' | 'staff' | 'public';

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date | null;
  updatedAt: Date | null;
}
