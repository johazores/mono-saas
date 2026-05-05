export type { AppEnv } from "@/lib/env";

export type AuthProvider = "credentials" | "clerk";

export type AuthConfig = {
  provider: AuthProvider;
  clerkPublishableKey: string;
  clerkSecretKey: string;
};

export type PublicAuthConfig = {
  provider: AuthProvider;
  clerkPublishableKey: string;
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
  accent?: string;
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
