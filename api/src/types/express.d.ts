import { UserRoleType } from '../models/user.model';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: UserRoleType[];
  department?: string;
  isActive: boolean;
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
