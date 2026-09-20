export type UserRole = 'admin' | 'supervisor' | 'student' | 'teacher';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studentId?: string;
  groupId?: string;
  groupName?: string;
  cefrLevel?: string;
}
