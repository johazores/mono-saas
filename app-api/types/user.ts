import type { AccountStatus } from "./auth";

export type UserRecord = {
  id: string;
  email: string;
  clerkId: string | null;
  name: string;
  stripeCustomerId: string | null;
  status: AccountStatus;
  parentId: string | null;
  ancestors: string[];
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  phone: string | null;
  address: UserAddress | null;
  createdAt: Date;
  updatedAt: Date;
  activePlan?: {
    id: string;
    name: string;
    slug: string;
    purchaseId: string;
    endDate: Date | null;
  } | null;
};

export type CreateSubUserInput = {
  email: string;
};

export type CreateSubUserResult = {
  user: UserRecord;
  linked: boolean;
  generatedPassword: string | null;
};

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
};

export type UserAddress = {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  status?: AccountStatus;
  phone?: string;
  address?: UserAddress;
};

export type UpdateUserProfileInput = {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
};

export type UserAuthSession = {
  user: {
    id: string;
    name: string;
    email: string;
    status: AccountStatus;
    parentId: string | null;
    parent: { name: string; email: string } | null;
    activePlan: {
      name: string;
      slug: string;
      endDate: Date | null;
    } | null;
  };
};
