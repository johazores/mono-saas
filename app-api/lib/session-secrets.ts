const MIN_SECRET_LENGTH = 32;

function requireSecret(name: "SESSION_SECRET" | "USER_SESSION_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Refusing to start with an insecure default.`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return value;
}

export function getSessionSecret(): string {
  return requireSecret("SESSION_SECRET");
}

export function getUserSessionSecret(): string {
  return requireSecret("USER_SESSION_SECRET");
}
