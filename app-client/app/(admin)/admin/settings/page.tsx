"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  adminSettingService,
  adminSystemConfigService,
} from "@/services/admin-setting-service";
import {
  PageHeader,
  Notice,
  Button,
  Tabs,
  FormField,
  FormSelect,
} from "@/components/ui";
import type {
  AuthProvider,
  PaymentMode,
  AuthSettings,
  PaymentSettings,
  ThemeTokens,
} from "@/types";
import { Shield, CreditCard, Globe, Palette, Server } from "lucide-react";

const TABS = [
  { id: "environment", label: "Environment", icon: <Server size={16} /> },
  { id: "auth", label: "Authentication", icon: <Shield size={16} /> },
  { id: "payment", label: "Payment", icon: <CreditCard size={16} /> },
  { id: "site", label: "Site Identity", icon: <Globe size={16} /> },
  { id: "theme", label: "Theme", icon: <Palette size={16} /> },
];

const THEME_FIELDS: { key: keyof ThemeTokens; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "primaryHover", label: "Primary Hover" },
  { key: "secondary", label: "Secondary" },
  { key: "secondaryHover", label: "Secondary Hover" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "border", label: "Border" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Text Muted" },
  { key: "success", label: "Success" },
  { key: "error", label: "Error" },
  { key: "warning", label: "Warning" },
  { key: "info", label: "Info" },
];

const GRADIENT_FIELDS: { key: keyof ThemeTokens; label: string }[] = [
  { key: "primaryGradient", label: "Primary Gradient" },
  { key: "secondaryGradient", label: "Secondary Gradient" },
  { key: "accentGradient", label: "Accent Gradient" },
];

const DEFAULT_THEME: ThemeTokens = {
  primary: "#2563eb",
  primaryHover: "#1d4ed8",
  secondary: "#4b5563",
  secondaryHover: "#374151",
  accent: "#7c3aed",
  background: "#ffffff",
  surface: "#f9fafb",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};

function formatAuthorizedParties(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }

  return typeof value === "string" ? value : "";
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "auth",
  );

  const [auth, setAuth] = useState<AuthSettings>({
    provider: "credentials",
    clerkPublishableKey: "",
    clerkSecretKey: "",
    authorizedParties: "",
    openSignup: false,
  });
  const [payment, setPayment] = useState<PaymentSettings>({
    provider: "stripe",
    mode: "test",
    stripeTestPublicKey: "",
    stripeTestSecretKey: "",
    stripeLivePublicKey: "",
    stripeLiveSecretKey: "",
  });
  const [loading, setLoading] = useState(true);
  const [savingAuth, setSavingAuth] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingSite, setSavingSite] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [siteMessage, setSiteMessage] = useState("");
  const [themeMessage, setThemeMessage] = useState("");
  const [siteTitle, setSiteTitle] = useState("");
  const [siteTagline, setSiteTagline] = useState("");
  const [siteAuthQuote, setSiteAuthQuote] = useState("");
  const [siteFavicon, setSiteFavicon] = useState("");
  const [siteLogo, setSiteLogo] = useState("");
  const [siteLogoDark, setSiteLogoDark] = useState("");
  const [theme, setTheme] = useState<ThemeTokens>({ ...DEFAULT_THEME });

  // Environment tab state
  const [currentEnv, setCurrentEnv] = useState<"dev" | "production">("dev");
  const [selectedEnv, setSelectedEnv] = useState<"dev" | "production">("dev");
  const [envConfirmText, setEnvConfirmText] = useState("");
  const [savingEnv, setSavingEnv] = useState(false);
  const [envMessage, setEnvMessage] = useState("");
  const [showEnvConfirm, setShowEnvConfirm] = useState(false);

  function handleTabChange(tabId: string) {
    setActiveTab(tabId);
    router.replace(`/admin/settings?tab=${tabId}`, { scroll: false });
  }

  useEffect(() => {
    adminSettingService
      .getAll()
      .then((res) => {
        if (res.ok && res.data) {
          const map = new Map(
            res.data.items.map((setting) => [setting.key, setting.value]),
          );
          setAuth({
            provider:
              (map.get("auth.provider") as AuthProvider) || "credentials",
            clerkPublishableKey:
              (map.get("auth.clerkPublishableKey") as string) || "",
            clerkSecretKey:
              (map.get("auth.clerkSecretKey") as string) || "",
            authorizedParties: formatAuthorizedParties(
              map.get("auth.authorizedParties"),
            ),
            openSignup: map.get("auth.openSignup") === true,
          });
          setPayment({
            provider: (map.get("payment.provider") as string) || "stripe",
            mode: (map.get("payment.mode") as PaymentMode) || "test",
            stripeTestPublicKey:
              (map.get("payment.stripe.testPublicKey") as string) || "",
            stripeTestSecretKey:
              (map.get("payment.stripe.testSecretKey") as string) || "",
            stripeLivePublicKey:
              (map.get("payment.stripe.livePublicKey") as string) || "",
            stripeLiveSecretKey:
              (map.get("payment.stripe.liveSecretKey") as string) || "",
          });
          setSiteTitle((map.get("site.title") as string) || "");
          setSiteTagline((map.get("site.tagline") as string) || "");
          setSiteAuthQuote((map.get("site.authQuote") as string) || "");
          setSiteFavicon((map.get("site.favicon") as string) || "");
          setSiteLogo((map.get("site.logo") as string) || "");
          setSiteLogoDark((map.get("site.logoDark") as string) || "");
          const loadedTheme: ThemeTokens = { ...DEFAULT_THEME };
          for (const { key } of THEME_FIELDS) {
            const value = map.get(`theme.${key}`) as string;
            if (value) loadedTheme[key] = value;
          }
          setTheme(loadedTheme);
        }
      })
      .finally(() => setLoading(false));

    // Load system config (environment)
    adminSystemConfigService.get("APP_ENV").then((res) => {
      if (res.ok && res.data) {
        const value = (res.data.value as "dev" | "production") || "dev";
        setCurrentEnv(value);
        setSelectedEnv(value);
      }
    });
  }, []);

  async function handleEnvSwitch() {
    if (selectedEnv === currentEnv) {
      setEnvMessage("Environment is already set to " + currentEnv + ".");
      return;
    }
    if (envConfirmText !== selectedEnv) {
      setEnvMessage(`Please type "${selectedEnv}" to confirm the switch.`);
      return;
    }
    setSavingEnv(true);
    setEnvMessage("");
    try {
      const res = await adminSystemConfigService.update("APP_ENV", selectedEnv);
      if (res.ok) {
        setCurrentEnv(selectedEnv);
        setEnvMessage(`Environment switched to "${selectedEnv}" successfully.`);
        setShowEnvConfirm(false);
        setEnvConfirmText("");
      }
    } catch (err) {
      setEnvMessage(
        err instanceof Error ? err.message : "Failed to switch environment.",
      );
    } finally {
      setSavingEnv(false);
    }
  }

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingAuth(true);
    setAuthMessage("");

    try {
      if (auth.provider === "clerk") {
        await adminSettingService.update(
          "auth.clerkPublishableKey",
          auth.clerkPublishableKey,
        );
        await adminSettingService.update(
          "auth.clerkSecretKey",
          auth.clerkSecretKey,
        );
        await adminSettingService.update(
          "auth.authorizedParties",
          auth.authorizedParties,
        );
        await adminSettingService.update("auth.openSignup", auth.openSignup);
      }
      await adminSettingService.update("auth.provider", auth.provider);
      setAuthMessage("Auth settings saved successfully.");
    } catch (err) {
      setAuthMessage(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      setSavingAuth(false);
    }
  }

  async function handlePaymentSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingPayment(true);
    setPaymentMessage("");

    try {
      await adminSettingService.update("payment.provider", payment.provider);
      await adminSettingService.update("payment.mode", payment.mode);
      await adminSettingService.update(
        "payment.stripe.testPublicKey",
        payment.stripeTestPublicKey,
      );
      await adminSettingService.update(
        "payment.stripe.testSecretKey",
        payment.stripeTestSecretKey,
      );
      await adminSettingService.update(
        "payment.stripe.livePublicKey",
        payment.stripeLivePublicKey,
      );
      await adminSettingService.update(
        "payment.stripe.liveSecretKey",
        payment.stripeLiveSecretKey,
      );
      setPaymentMessage("Payment settings saved successfully.");
    } catch (err) {
      setPaymentMessage(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleSiteSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingSite(true);
    setSiteMessage("");
    try {
      await adminSettingService.update("site.title", siteTitle);
      await adminSettingService.update("site.tagline", siteTagline);
      await adminSettingService.update("site.authQuote", siteAuthQuote);
      await adminSettingService.update("site.favicon", siteFavicon);
      await adminSettingService.update("site.logo", siteLogo);
      await adminSettingService.update("site.logoDark", siteLogoDark);
      setSiteMessage("Site settings saved successfully.");
    } catch (err) {
      setSiteMessage(
        err instanceof Error ? err.message : "Failed to save.",
      );
    } finally {
      setSavingSite(false);
    }
  }

  async function handleThemeSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingTheme(true);
    setThemeMessage("");
    try {
      for (const { key } of [...THEME_FIELDS, ...GRADIENT_FIELDS]) {
        await adminSettingService.update(`theme.${key}`, theme[key] ?? "");
      }
      setThemeMessage("Theme saved successfully. Reload to see changes.");
    } catch (err) {
      setThemeMessage(
        err instanceof Error ? err.message : "Failed to save.",
      );
    } finally {
      setSavingTheme(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading settings&hellip;</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure environment, authentication, payment, site identity, and theme."
      />

      <Tabs tabs={TABS} activeTab={activeTab} onChange={handleTabChange}>
        {activeTab === "environment" && (
          <section className="rounded-xl border border-border bg-background p-6">
            <div className="max-w-lg space-y-5">
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                <p className="text-sm font-medium text-warning">
                  Warning: Switching the environment changes the data partition
                  for ALL API traffic.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Dev and production data are independent. Switching does not
                  delete data — it changes which dataset is active.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground">
                  Current environment:
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    currentEnv === "production"
                      ? "bg-error/10 text-error"
                      : "bg-success/10 text-success"
                  }`}
                >
                  {currentEnv}
                </span>
              </div>

              {envMessage && (
                <Notice
                  message={envMessage}
                  variant={envMessage.includes("success") ? "success" : "error"}
                />
              )}

              <FormSelect
                label="Switch to environment"
                value={selectedEnv}
                onChange={(e) => {
                  setSelectedEnv(e.target.value as "dev" | "production");
                  setShowEnvConfirm(false);
                  setEnvConfirmText("");
                  setEnvMessage("");
                }}
                options={[
                  { value: "dev", label: "dev" },
                  { value: "production", label: "production" },
                ]}
              />

              {selectedEnv !== currentEnv && !showEnvConfirm && (
                <Button
                  onClick={() => setShowEnvConfirm(true)}
                  variant="secondary"
                >
                  Switch Environment
                </Button>
              )}

              {showEnvConfirm && selectedEnv !== currentEnv && (
                <div className="space-y-3 rounded-lg border border-error/30 bg-error/5 p-4">
                  <p className="text-sm text-foreground">
                    To confirm, type <strong>{selectedEnv}</strong> below:
                  </p>
                  <input
                    type="text"
                    value={envConfirmText}
                    onChange={(e) => setEnvConfirmText(e.target.value)}
                    placeholder={`Type "${selectedEnv}" to confirm`}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                  <div className="flex gap-3">
                    <Button
                      onClick={handleEnvSwitch}
                      loading={savingEnv}
                      disabled={envConfirmText !== selectedEnv}
                    >
                      Confirm Switch
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowEnvConfirm(false);
                        setEnvConfirmText("");
                        setEnvMessage("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "auth" && (
          <section className="rounded-xl border border-border bg-background p-6">
            <form onSubmit={handleAuthSubmit} className="max-w-lg space-y-5">
              {authMessage && (
                <Notice
                  message={authMessage}
                  variant={authMessage.includes("success") ? "success" : "error"}
                />
              )}

              <FormSelect
                id="auth-provider"
                label="Authentication Provider"
                value={auth.provider}
                onChange={(e) =>
                  setAuth((state) => ({
                    ...state,
                    provider: e.target.value as AuthProvider,
                  }))
                }
                options={[
                  {
                    value: "credentials",
                    label: "Credentials (email & password)",
                  },
                  { value: "clerk", label: "Clerk" },
                ]}
                hint="Switching to Clerk will disable email/password login for users. Admin authentication is always password-based."
              />

              {auth.provider === "clerk" && (
                <>
                  <FormField
                    id="clerk-publishable-key"
                    label="Clerk Publishable Key"
                    type="text"
                    value={auth.clerkPublishableKey}
                    onChange={(e) =>
                      setAuth((state) => ({
                        ...state,
                        clerkPublishableKey: e.target.value,
                      }))
                    }
                    placeholder="pk_test_..."
                  />
                  <FormField
                    id="clerk-secret-key"
                    label="Clerk Secret Key"
                    type="password"
                    value={auth.clerkSecretKey}
                    onChange={(e) =>
                      setAuth((state) => ({
                        ...state,
                        clerkSecretKey: e.target.value,
                      }))
                    }
                    placeholder="sk_test_..."
                    hint="Stored securely. Required for backend token verification."
                  />
                  <FormField
                    id="clerk-authorized-parties"
                    label="Authorized Origins"
                    type="text"
                    value={auth.authorizedParties}
                    onChange={(e) =>
                      setAuth((state) => ({
                        ...state,
                        authorizedParties: e.target.value,
                      }))
                    }
                    placeholder="https://app.example.com, https://admin.example.com"
                    hint="Comma-separated URL origins. Paths are not allowed. These values are loaded from the database at runtime."
                  />
                  <label className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
                    <input
                      type="checkbox"
                      checked={auth.openSignup}
                      onChange={(e) =>
                        setAuth((state) => ({
                          ...state,
                          openSignup: e.target.checked,
                        }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        Allow open signup
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        When disabled, new Clerk users require a valid invitation.
                      </span>
                    </span>
                  </label>
                </>
              )}

              <Button type="submit" loading={savingAuth}>
                Save Auth Settings
              </Button>
            </form>
          </section>
        )}

        {activeTab === "payment" && (
          <section className="rounded-xl border border-border bg-background p-6">
            <form onSubmit={handlePaymentSubmit} className="max-w-lg space-y-5">
              {paymentMessage && (
                <Notice
                  message={paymentMessage}
                  variant={
                    paymentMessage.includes("success") ? "success" : "error"
                  }
                />
              )}

              <FormSelect
                id="payment-provider"
                label="Payment Provider"
                value={payment.provider}
                onChange={(e) =>
                  setPayment((state) => ({
                    ...state,
                    provider: e.target.value,
                  }))
                }
                options={[{ value: "stripe", label: "Stripe" }]}
              />

              <FormSelect
                id="payment-mode"
                label="Mode"
                value={payment.mode}
                onChange={(e) =>
                  setPayment((state) => ({
                    ...state,
                    mode: e.target.value as PaymentMode,
                  }))
                }
                options={[
                  { value: "test", label: "Test" },
                  { value: "live", label: "Live" },
                ]}
                hint="Test mode uses Stripe test keys. Switch to Live for real payments."
              />

              <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-medium text-foreground">
                  Test Mode Keys
                </h3>
                <FormField
                  id="stripe-test-pk"
                  label="Publishable Key"
                  type="text"
                  value={payment.stripeTestPublicKey}
                  onChange={(e) =>
                    setPayment((state) => ({
                      ...state,
                      stripeTestPublicKey: e.target.value,
                    }))
                  }
                  placeholder="pk_test_..."
                />
                <FormField
                  id="stripe-test-sk"
                  label="Secret Key"
                  type="password"
                  value={payment.stripeTestSecretKey}
                  onChange={(e) =>
                    setPayment((state) => ({
                      ...state,
                      stripeTestSecretKey: e.target.value,
                    }))
                  }
                  placeholder="sk_test_..."
                />
              </div>

              <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-medium text-foreground">
                  Live Mode Keys
                </h3>
                <FormField
                  id="stripe-live-pk"
                  label="Publishable Key"
                  type="text"
                  value={payment.stripeLivePublicKey}
                  onChange={(e) =>
                    setPayment((state) => ({
                      ...state,
                      stripeLivePublicKey: e.target.value,
                    }))
                  }
                  placeholder="pk_live_..."
                />
                <FormField
                  id="stripe-live-sk"
                  label="Secret Key"
                  type="password"
                  value={payment.stripeLiveSecretKey}
                  onChange={(e) =>
                    setPayment((state) => ({
                      ...state,
                      stripeLiveSecretKey: e.target.value,
                    }))
                  }
                  placeholder="sk_live_..."
                />
              </div>

              <Button type="submit" loading={savingPayment}>
                Save Payment Settings
              </Button>
            </form>
          </section>
        )}

        {activeTab === "site" && (
          <section className="rounded-xl border border-border bg-background p-6">
            <form onSubmit={handleSiteSubmit} className="max-w-lg space-y-5">
              {siteMessage && (
                <Notice
                  message={siteMessage}
                  variant={siteMessage.includes("success") ? "success" : "error"}
                />
              )}

              <FormField
                id="site-title"
                label="Site Title"
                type="text"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                placeholder="My Awesome Site"
              />

              <FormField
                id="site-tagline"
                label="Tagline"
                type="text"
                value={siteTagline}
                onChange={(e) => setSiteTagline(e.target.value)}
                placeholder="A brief description of your site"
              />

              <div>
                <label
                  htmlFor="site-auth-quote"
                  className="block text-sm font-medium text-foreground"
                >
                  Auth Page Quote
                </label>
                <textarea
                  id="site-auth-quote"
                  rows={3}
                  value={siteAuthQuote}
                  onChange={(e) => setSiteAuthQuote(e.target.value)}
                  placeholder="Shown on the login & register branding panel. Leave empty for default."
                  className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-xs text-muted">
                  Displayed on the left panel of login and register pages.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">
                  Favicon
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setSiteFavicon(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                  className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
                />
                {siteFavicon && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={siteFavicon}
                      alt="Favicon preview"
                      className="h-6 w-6 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setSiteFavicon("")}
                      className="text-xs text-error"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">
                  Logo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setSiteLogo(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                  className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
                />
                {siteLogo && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={siteLogo}
                      alt="Logo preview"
                      className="h-8 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setSiteLogo("")}
                      className="text-xs text-error"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">
                  Logo (Dark variant)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setSiteLogoDark(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                  className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
                />
                {siteLogoDark && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={siteLogoDark}
                      alt="Dark logo preview"
                      className="h-8 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setSiteLogoDark("")}
                      className="text-xs text-error"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <p className="mt-1 text-xs text-muted">
                  Optional. Used when a dark background is active.
                </p>
              </div>

              <Button type="submit" loading={savingSite}>
                Save Site Settings
              </Button>
            </form>
          </section>
        )}

        {activeTab === "theme" && (
          <section className="rounded-xl border border-border bg-background p-6">
            <form onSubmit={handleThemeSubmit} className="max-w-lg space-y-5">
              <p className="text-xs text-muted">
                Customize the application color palette. Changes apply after
                page reload.
              </p>

              {themeMessage && (
                <Notice
                  message={themeMessage}
                  variant={themeMessage.includes("success") ? "success" : "error"}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                {THEME_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={theme[key] || "#000000"}
                      onChange={(e) =>
                        setTheme((current) => ({
                          ...current,
                          [key]: e.target.value,
                        }))
                      }
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {label}
                      </p>
                      <p className="text-xs text-muted">{theme[key]}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Gradients{" "}
                  <span className="font-normal text-muted">
                    (optional — use CSS gradient syntax, e.g.
                    linear-gradient(135deg, #667eea, #764ba2))
                  </span>
                </p>
                {GRADIENT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 shrink-0 rounded-lg border border-border"
                      style={{ background: theme[key] || "transparent" }}
                    />
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {label}
                      </label>
                      <input
                        type="text"
                        value={theme[key] || ""}
                        onChange={(e) =>
                          setTheme((current) => ({
                            ...current,
                            [key]: e.target.value || undefined,
                          }))
                        }
                        placeholder="none"
                        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" loading={savingTheme}>
                  Save Theme
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setTheme({ ...DEFAULT_THEME })}
                >
                  Reset to Defaults
                </Button>
              </div>
            </form>
          </section>
        )}
      </Tabs>
    </div>
  );
}
