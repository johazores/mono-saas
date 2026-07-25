export type { AppEnv } from "@/lib/env";

export type AuthProvider = "credentials" | "clerk";

export type SystemConfigRecord = {
  key: string;
  value: unknown;
};

export type AuthConfig = {
  provider: AuthProvider;
  clerkPublishableKey: string;
  clerkSecretKey: string;
  authorizedParties: string[];
  openSignup: boolean;
};

export type PublicAuthConfig = {
  provider: AuthProvider;
  clerkPublishableKey: string;
  openSignup: boolean;
};

export type SettingRecord = {
  id: string;
  env: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type ThemeTokens = {
  primary?: string;
  primaryHover?: string;
  primaryGradient?: string;
  secondary?: string;
  secondaryHover?: string;
  secondaryGradient?: string;
  accent?: string;
  accentGradient?: string;
  background?: string;
  surface?: string;
  border?: string;
  text?: string;
  textMuted?: string;
  success?: string;
  error?: string;
  warning?: string;
  info?: string;
};

export type SiteConfig = {
  title: string;
  tagline: string;
  favicon: string;
  logo: string;
  logoDark: string;
  authQuote: string;
  theme: ThemeTokens;
};
