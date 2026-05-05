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
