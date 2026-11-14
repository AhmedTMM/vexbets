export interface SttTokens {
  provider: string;
  /** A short-lived token the listener tab uses instead of the real API key. */
  mint(): Promise<{ token: string; expiresAt: Date }>;
}
