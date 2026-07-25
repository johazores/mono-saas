export type VerifiedIdentity = {
  provider: string;
  subject: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  claims: Record<string, unknown>;
};

export type AuthRequest = {
  authorization?: string;
  cookies: Record<string, string | undefined>;
  origin?: string;
};

export type AuthProfile = {
  email?: string;
  name?: string;
};

export interface AuthProviderInterface {
  readonly name: string;
  verify(request: AuthRequest): Promise<VerifiedIdentity | null>;
  getProfile?(subject: string): Promise<AuthProfile | null>;
  revokeSession?(sessionId: string): Promise<void>;
}
