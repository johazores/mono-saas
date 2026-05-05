export type InvitationStatus = "pending" | "accepted" | "expired";

export type InvitationRecord = {
  id: string;
  env: string;
  email: string;
  name: string | null;
  status: InvitationStatus;
  expiresAt: Date;
  invitedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateInvitationInput = {
  email: string;
  name?: string;
};

export type AcceptInvitationInput = {
  token: string;
  password: string;
  name?: string;
};
