const MIN_SECRET_LENGTH = 32;

function requireSessionSecret(
  name: "ADMIN_SESSION_SECRET" | "USER_SESSION_SECRET",
): string {
  const secret = process.env[name];
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be set and at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return secret;
}

export function getSessionSecret(): string {
  return requireSessionSecret("ADMIN_SESSION_SECRET");
}

export function getUserSessionSecret(): string {
  return requireSessionSecret("USER_SESSION_SECRET");
}
