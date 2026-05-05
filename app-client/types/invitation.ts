export type InvitationStatus = "pending" | "accepted" | "expired";

export type Invitation = {
  id: string;
  email: string;
  name: string | null;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
};

export type CreateInvitationInput = {
  email: string;
  name?: string;
};

export type CreateInvitationResult = {
  invitation: Invitation;
  token?: string;
};
