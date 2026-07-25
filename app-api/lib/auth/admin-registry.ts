import { adminCredentialsAuthProvider } from "./admin-credentials-provider";
import type { AuthProviderInterface } from "./types";

const providers: Record<string, AuthProviderInterface> = {
  "admin-credentials": adminCredentialsAuthProvider,
};

export function getAdminAuthProvider(
  name = "admin-credentials",
): AuthProviderInterface {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown administrator authentication provider: ${name}`);
  }
  return provider;
}
