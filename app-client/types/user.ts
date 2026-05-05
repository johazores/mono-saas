export type AppUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  parentId: string | null;
  parent: { name: string; email: string } | null;
  activePlan: {
    name: string;
    slug: string;
    endDate: string | null;
  } | null;
  impersonation?: {
    adminId: string;
    adminName: string;
  };
};

export type UpdateUserProfileInput = {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
};
