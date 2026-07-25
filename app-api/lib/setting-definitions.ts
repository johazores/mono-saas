export type SettingDefinition = {
  key: string;
  secret?: boolean;
};

export const MASKED_SECRET_VALUE = "********";

const definitions = new Map<string, SettingDefinition>();

export function registerSettingDefinitions(
  source: string,
  items: SettingDefinition[],
): void {
  for (const item of items) {
    if (definitions.has(item.key)) {
      throw new Error(`Duplicate setting key "${item.key}" from ${source}.`);
    }
    definitions.set(item.key, Object.freeze({ ...item }));
  }
}

export function isAllowedSettingKey(key: string): boolean {
  return definitions.has(key);
}

export function isSecretSettingKey(key: string): boolean {
  return definitions.get(key)?.secret === true;
}

export function listSecretSettingKeys(): string[] {
  return [...definitions.values()]
    .filter((definition) => definition.secret)
    .map((definition) => definition.key);
}

registerSettingDefinitions("core", [
  { key: "auth.provider" },
  { key: "auth.clerkPublishableKey" },
  { key: "auth.clerkSecretKey", secret: true },
  { key: "auth.authorizedParties" },
  { key: "auth.openSignup" },
  { key: "payment.provider" },
  { key: "payment.mode" },
  { key: "payment.stripe.testPublicKey" },
  { key: "payment.stripe.testSecretKey", secret: true },
  { key: "payment.stripe.livePublicKey" },
  { key: "payment.stripe.liveSecretKey", secret: true },
  { key: "site.title" },
  { key: "site.tagline" },
  { key: "site.favicon" },
  { key: "site.logo" },
  { key: "site.logoDark" },
  { key: "site.authQuote" },
  { key: "theme.primary" },
  { key: "theme.primaryHover" },
  { key: "theme.primaryGradient" },
  { key: "theme.secondary" },
  { key: "theme.secondaryHover" },
  { key: "theme.secondaryGradient" },
  { key: "theme.accent" },
  { key: "theme.accentGradient" },
  { key: "theme.background" },
  { key: "theme.surface" },
  { key: "theme.border" },
  { key: "theme.text" },
  { key: "theme.textMuted" },
  { key: "theme.success" },
  { key: "theme.error" },
  { key: "theme.warning" },
  { key: "theme.info" },
]);
