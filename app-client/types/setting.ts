export type AuthProvider = "credentials" | "clerk";

export type PublicAuthConfig = {
  provider: AuthProvider;
  clerkPublishableKey: string;
};

export type SettingItem = { key: string; value: unknown };

export type SystemConfigItem = { key: string; value: unknown };

export type PaymentMode = "test" | "live";

export type AuthSettings = {
  provider: AuthProvider;
  clerkPublishableKey: string;
  clerkSecretKey: string;
};

export type PaymentSettings = {
  provider: string;
  mode: PaymentMode;
  stripeTestPublicKey: string;
  stripeTestSecretKey: string;
  stripeLivePublicKey: string;
  stripeLiveSecretKey: string;
};
