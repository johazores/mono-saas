import { createAsyncTtlCache } from "@/lib/async-ttl-cache";
import { settingRepository } from "@/repositories/setting-repository";
import {
  isAllowedSettingKey,
  isSecretSettingKey,
  MASKED_SECRET_VALUE,
} from "@/lib/setting-definitions";
import type {
  AuthConfig,
  AuthProvider,
  ClerkSecurityConfig,
  PublicAuthConfig,
  PaymentConfig,
  PaymentMode,
  PaymentProviderName,
  PublicPaymentConfig,
  SiteConfig,
  ThemeTokens,
} from "@/types";

const CONFIG_CACHE_MS = 5_000;

const AUTH_DEFAULTS: AuthConfig = {
  provider: "credentials",
  clerkPublishableKey: "",
  clerkSecretKey: "",
};

function maskSecret(key: string, value: unknown): unknown {
  if (!isSecretSettingKey(key)) return value;
  return value === null || value === undefined || value === ""
    ? ""
    : MASKED_SECRET_VALUE;
}

function normalizeAuthorizedParties(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const parties = rawValues
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return [...new Set(parties)];
}

function validateAuthorizedParties(value: unknown): string[] {
  const parties = normalizeAuthorizedParties(value);
  if (parties.length === 0) {
    throw new Error("At least one Clerk authorized party is required.");
  }

  for (const party of parties) {
    let url: URL;
    try {
      url = new URL(party);
    } catch {
      throw new Error(`Invalid Clerk authorized party: ${party}`);
    }
    if (url.origin !== party) {
      throw new Error(
        `Clerk authorized parties must be origins without paths: ${party}`,
      );
    }
  }

  return parties;
}

async function loadAuthConfig(): Promise<AuthConfig> {
  const records = await settingRepository.getMany([
    "auth.provider",
    "auth.clerkPublishableKey",
    "auth.clerkSecretKey",
  ]);
  const map = new Map(records.map((record) => [record.key, record.value]));

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
}

async function loadClerkSecurityConfig(): Promise<ClerkSecurityConfig> {
  const records = await settingRepository.getMany([
    "auth.authorizedParties",
    "auth.openSignup",
  ]);
  const map = new Map(records.map((record) => [record.key, record.value]));
  const configuredParties = normalizeAuthorizedParties(
    map.get("auth.authorizedParties"),
  );
  const fallbackParties = normalizeAuthorizedParties(
    process.env.CLIENT_ORIGIN ?? "",
  );

  return {
    authorizedParties:
      configuredParties.length > 0 ? configuredParties : fallbackParties,
    openSignup: map.get("auth.openSignup") === true,
  };
}

async function loadPaymentConfig(): Promise<PaymentConfig> {
  const records = await settingRepository.getMany([
    "payment.provider",
    "payment.mode",
    "payment.stripe.testPublicKey",
    "payment.stripe.testSecretKey",
    "payment.stripe.livePublicKey",
    "payment.stripe.liveSecretKey",
  ]);
  const map = new Map(records.map((record) => [record.key, record.value]));

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
}

async function loadSiteConfig(): Promise<SiteConfig> {
  const records = await settingRepository.getAll();
  const map = new Map(records.map((record) => [record.key, record.value]));

  const theme: ThemeTokens = {};
  for (const [key, value] of map) {
    if (key.startsWith("theme.") && typeof value === "string" && value !== "") {
      const token = key.slice(6) as keyof ThemeTokens;
      theme[token] = value;
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
}

const authConfigCache = createAsyncTtlCache(loadAuthConfig, CONFIG_CACHE_MS);
const clerkSecurityCache = createAsyncTtlCache(
  loadClerkSecurityConfig,
  CONFIG_CACHE_MS,
);
const paymentConfigCache = createAsyncTtlCache(
  loadPaymentConfig,
  CONFIG_CACHE_MS,
);
const siteConfigCache = createAsyncTtlCache(loadSiteConfig, CONFIG_CACHE_MS);

function invalidateConfigCaches(key?: string): void {
  if (!key || key.startsWith("auth.")) {
    authConfigCache.invalidate();
    clerkSecurityCache.invalidate();
  }
  if (!key || key.startsWith("payment.")) {
    paymentConfigCache.invalidate();
  }
  if (!key || key.startsWith("site.") || key.startsWith("theme.")) {
    siteConfigCache.invalidate();
  }
}

export const settingService = {
  invalidateCache(key?: string): void {
    invalidateConfigCaches(key);
  },

  async get(key: string): Promise<unknown> {
    const record = await settingRepository.get(key);
    return record ? maskSecret(key, record.value) : null;
  },

  async set(key: string, value: unknown): Promise<void> {
    if (!isAllowedSettingKey(key)) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    // The admin settings UI receives only a mask for configured secrets.
    // Sending that same mask back means "keep the existing value".
    if (isSecretSettingKey(key) && value === MASKED_SECRET_VALUE) {
      return;
    }

    if (key === "auth.provider") {
      const valid: AuthProvider[] = ["credentials", "clerk"];
      if (!valid.includes(value as AuthProvider)) {
        throw new Error(
          `Invalid auth provider. Must be one of: ${valid.join(", ")}`,
        );
      }
    }

    if (key === "auth.authorizedParties") {
      value = validateAuthorizedParties(value);
    }

    if (key === "auth.openSignup" && typeof value !== "boolean") {
      throw new Error("auth.openSignup must be a boolean.");
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
      const isGradient = key.endsWith("Gradient");
      if (!isGradient && !/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new Error(
          `Invalid color value for ${key}. Must be a hex color (e.g. #2563eb).`,
        );
      }
    }

    await settingRepository.set(key, value);
    invalidateConfigCaches(key);
  },

  async getAll(): Promise<Array<{ key: string; value: unknown }>> {
    const records = await settingRepository.getAll();
    return records.map((record) => ({
      key: record.key,
      value: maskSecret(record.key, record.value),
    }));
  },

  async getAuthConfig(): Promise<AuthConfig> {
    return authConfigCache.get();
  },

  async getClerkSecurityConfig(): Promise<ClerkSecurityConfig> {
    return clerkSecurityCache.get();
  },

  async getPublicAuthConfig(): Promise<PublicAuthConfig> {
    const config = await authConfigCache.get();
    return {
      provider: config.provider,
      clerkPublishableKey: config.clerkPublishableKey,
    };
  },

  async getPaymentConfig(): Promise<PaymentConfig> {
    return paymentConfigCache.get();
  },

  async getPublicPaymentConfig(): Promise<PublicPaymentConfig> {
    const config = await paymentConfigCache.get();
    return {
      provider: config.provider,
      mode: config.mode,
      publicKey: config.publicKey,
    };
  },

  async getSiteConfig(): Promise<SiteConfig> {
    return siteConfigCache.get();
  },
};
