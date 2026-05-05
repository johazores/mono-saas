import { settingRepository } from "@/repositories/setting-repository";
import type {
  AuthConfig,
  AuthProvider,
  PublicAuthConfig,
  PaymentConfig,
  PaymentMode,
  PaymentProviderName,
  PublicPaymentConfig,
  SiteConfig,
  ThemeTokens,
} from "@/types";

const ALLOWED_KEYS = new Set([
  "auth.provider",
  "auth.clerkPublishableKey",
  "auth.clerkSecretKey",
  "payment.provider",
  "payment.mode",
  "payment.stripe.testPublicKey",
  "payment.stripe.testSecretKey",
  "payment.stripe.livePublicKey",
  "payment.stripe.liveSecretKey",
  // Site identity
  "site.title",
  "site.tagline",
  "site.favicon",
  "site.logo",
  "site.logoDark",
  "site.authQuote",
  // Theme tokens
  "theme.primary",
  "theme.primaryHover",
  "theme.accent",
  "theme.background",
  "theme.surface",
  "theme.border",
  "theme.text",
  "theme.textMuted",
  "theme.success",
  "theme.error",
  "theme.warning",
  "theme.info",
]);

const AUTH_DEFAULTS: AuthConfig = {
  provider: "credentials",
  clerkPublishableKey: "",
  clerkSecretKey: "",
};

export const settingService = {
  async get(key: string): Promise<unknown> {
    const record = await settingRepository.get(key);
    return record?.value ?? null;
  },

  async set(key: string, value: unknown): Promise<void> {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    if (key === "auth.provider") {
      const valid: AuthProvider[] = ["credentials", "clerk"];
      if (!valid.includes(value as AuthProvider)) {
        throw new Error(
          `Invalid auth provider. Must be one of: ${valid.join(", ")}`,
        );
      }
    }

    if (key === "payment.provider") {
      const valid: PaymentProviderName[] = ["stripe", "woocommerce"];
      if (!valid.includes(value as PaymentProviderName)) {
        throw new Error(
          `Invalid payment provider. Must be one of: ${valid.join(", ")}`,
        );
      }
    }

    if (key === "payment.mode") {
      const valid: PaymentMode[] = ["test", "live"];
      if (!valid.includes(value as PaymentMode)) {
        throw new Error(
          `Invalid payment mode. Must be one of: ${valid.join(", ")}`,
        );
      }
    }

    if (key.startsWith("theme.") && typeof value === "string" && value !== "") {
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new Error(
          `Invalid color value for ${key}. Must be a hex color (e.g. #2563eb).`,
        );
      }
    }

    await settingRepository.set(key, value);
  },

  async getAll(): Promise<Array<{ key: string; value: unknown }>> {
    const records = await settingRepository.getAll();
    return records.map((r) => ({ key: r.key, value: r.value }));
  },

  async getAuthConfig(): Promise<AuthConfig> {
    const keys = [
      "auth.provider",
      "auth.clerkPublishableKey",
      "auth.clerkSecretKey",
    ];
    const records = await settingRepository.getMany(keys);
    const map = new Map(records.map((r) => [r.key, r.value]));

    return {
      provider:
        (map.get("auth.provider") as AuthProvider) ?? AUTH_DEFAULTS.provider,
      clerkPublishableKey:
        (map.get("auth.clerkPublishableKey") as string) ??
        AUTH_DEFAULTS.clerkPublishableKey,
      clerkSecretKey:
        (map.get("auth.clerkSecretKey") as string) ??
        AUTH_DEFAULTS.clerkSecretKey,
    };
  },

  async getPublicAuthConfig(): Promise<PublicAuthConfig> {
    const config = await this.getAuthConfig();
    return {
      provider: config.provider,
      clerkPublishableKey: config.clerkPublishableKey,
    };
  },

  async getPaymentConfig(): Promise<PaymentConfig> {
    const keys = [
      "payment.provider",
      "payment.mode",
      "payment.stripe.testPublicKey",
      "payment.stripe.testSecretKey",
      "payment.stripe.livePublicKey",
      "payment.stripe.liveSecretKey",
    ];
    const records = await settingRepository.getMany(keys);
    const map = new Map(records.map((r) => [r.key, r.value]));

    const provider =
      (map.get("payment.provider") as PaymentProviderName) ?? "stripe";
    const mode = (map.get("payment.mode") as PaymentMode) ?? "test";

    const publicKey =
      mode === "test"
        ? ((map.get("payment.stripe.testPublicKey") as string) ?? "")
        : ((map.get("payment.stripe.livePublicKey") as string) ?? "");
    const secretKey =
      mode === "test"
        ? ((map.get("payment.stripe.testSecretKey") as string) ?? "")
        : ((map.get("payment.stripe.liveSecretKey") as string) ?? "");

    return { provider, mode, publicKey, secretKey };
  },

  async getPublicPaymentConfig(): Promise<PublicPaymentConfig> {
    const config = await this.getPaymentConfig();
    return {
      provider: config.provider,
      mode: config.mode,
      publicKey: config.publicKey,
    };
  },

  async getSiteConfig(): Promise<SiteConfig> {
    const records = await settingRepository.getAll();
    const map = new Map(records.map((r) => [r.key, r.value]));

    const theme: ThemeTokens = {};
    for (const [key, val] of map) {
      if (key.startsWith("theme.") && typeof val === "string" && val !== "") {
        const token = key.slice(6) as keyof ThemeTokens;
        theme[token] = val;
      }
    }

    return {
      title: (map.get("site.title") as string) ?? "mono-next",
      tagline: (map.get("site.tagline") as string) ?? "",
      favicon: (map.get("site.favicon") as string) ?? "",
      logo: (map.get("site.logo") as string) ?? "",
      logoDark: (map.get("site.logoDark") as string) ?? "",
      authQuote: (map.get("site.authQuote") as string) ?? "",
      theme,
    };
  },
};
