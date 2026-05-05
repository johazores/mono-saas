"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/swr";
import type { SiteConfig, ThemeTokens } from "@/types";

const TOKEN_TO_VAR: Record<keyof ThemeTokens, string> = {
  primary: "--theme-primary",
  primaryHover: "--theme-primary-hover",
  primaryGradient: "--theme-primary-gradient",
  secondary: "--theme-secondary",
  secondaryHover: "--theme-secondary-hover",
  secondaryGradient: "--theme-secondary-gradient",
  accent: "--theme-accent",
  accentGradient: "--theme-accent-gradient",
  background: "--theme-background",
  surface: "--theme-surface",
  border: "--theme-border",
  text: "--theme-text",
  textMuted: "--theme-text-muted",
  success: "--theme-success",
  error: "--theme-error",
  warning: "--theme-warning",
  info: "--theme-info",
};

const DEFAULT_CONFIG: SiteConfig = {
  title: "mono-next",
  tagline: "",
  favicon: "",
  logo: "",
  logoDark: "",
  authQuote: "",
  theme: {},
};

const SiteConfigContext = createContext<SiteConfig>(DEFAULT_CONFIG);

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}

function applyThemeVars(theme: ThemeTokens) {
  const root = document.documentElement;
  for (const [token, cssVar] of Object.entries(TOKEN_TO_VAR)) {
    const value = theme[token as keyof ThemeTokens];
    if (value) {
      root.style.setProperty(cssVar, value);
    } else {
      root.style.removeProperty(cssVar);
    }
  }
}

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useSWR<SiteConfig>("/api/settings/site", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    errorRetryCount: 1,
  });

  const config = data ?? DEFAULT_CONFIG;

  useEffect(() => {
    if (data?.theme) {
      applyThemeVars(data.theme);
    }
  }, [data]);

  return (
    <SiteConfigContext.Provider value={config}>
      {children}
    </SiteConfigContext.Provider>
  );
}
