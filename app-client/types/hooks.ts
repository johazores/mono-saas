import type { FeatureFlag } from "./feature";
import type { CartItem } from "./checkout";
import type { Product } from "./product";
import type { AuthProvider } from "./setting";

export type FeaturesState = {
  features: FeatureFlag[];
  loading: boolean;
  error: string;
};

export type AdminResourceState<T> = {
  items: T[];
  loading: boolean;
  error: string;
};

export type AuthConfigContextValue = {
  provider: AuthProvider;
  clerkPublishableKey: string;
  ready: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

export type CartContextValue = {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  total: number;
};
