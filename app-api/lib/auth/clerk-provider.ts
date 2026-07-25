import {
  getClerkUserProfile,
  verifyClerkAuthorization,
} from "@/lib/clerk-auth";
import type { AuthProviderInterface } from "./types";

export const clerkAuthProvider: AuthProviderInterface = {
  name: "clerk",

  async verify(request) {
    const payload = await verifyClerkAuthorization(request.authorization);
    if (!payload?.sub) return null;

    return {
      provider: "clerk",
      subject: payload.sub,
      email: payload.email,
      name: payload.name,
      claims: {},
    };
  },

  getProfile(subject) {
    return getClerkUserProfile(subject);
  },
};
