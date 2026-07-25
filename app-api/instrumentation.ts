import { validateBootstrapEnv } from "@/lib/bootstrap-env";

export function register(): void {
  validateBootstrapEnv();
}
