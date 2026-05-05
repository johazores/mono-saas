import { apiGet, apiPost, apiDelete } from "./api-client";
import type { Invitation, CreateInvitationInput, CreateInvitationResult } from "@/types";

export const invitationService = {
  async list() {
    const result = await apiGet<{ items: Invitation[] }>("/api/users/invitations");
    return result.data?.items ?? [];
  },
  async create(input: CreateInvitationInput) {
    return apiPost<CreateInvitationResult>("/api/users/invitations", input);
  },
  async revoke(id: string) {
    return apiDelete(`/api/users/invitations/${id}`);
  },
  async accept(token: string, password: string, name?: string) {
    return apiPost("/api/users/invitations/accept", { token, password, name });
  },
};
