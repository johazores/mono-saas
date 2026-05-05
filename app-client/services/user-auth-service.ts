import { apiPost, apiGet, apiPut } from "./api-client";
import type { AppUser, UpdateUserProfileInput } from "@/types";

export const userAuthService = {
  async register(name: string, email: string, password: string) {
    return apiPost<AppUser>("/api/users/auth/register", {
      name,
      email,
      password,
    });
  },
  async login(email: string, password: string) {
    return apiPost<AppUser>("/api/users/auth/login", { email, password });
  },
  async logout() {
    return apiPost("/api/users/auth/logout");
  },
  async me() {
    return apiGet<AppUser>("/api/users/auth/me");
  },
  async getProfile() {
    return apiGet<AppUser>("/api/users/auth/profile");
  },
  async updateProfile(input: UpdateUserProfileInput) {
    return apiPut<AppUser>("/api/users/auth/profile", input);
  },
  async stopImpersonation() {
    return apiPost<{ redirectUrl: string }>("/api/users/auth/stop-impersonation");
  },
};
