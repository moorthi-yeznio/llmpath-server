import type { AppUser } from '../auth/types/app-user.js';

declare global {
  namespace Express {
    interface Request {
      user?: AppUser;
    }
  }
}

export {};
