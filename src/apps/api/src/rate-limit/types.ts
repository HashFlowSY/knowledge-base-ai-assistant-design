export type RateLimitScope =
  | "auth"
  | "document-upload"
  | "knowledge-base"
  | "user-management";

export interface RateLimitKeyInput {
  scope: RateLimitScope;
  window: string;
  identity: string;
}

export type RateLimitIdentityInput =
  | {
      kind: "login";
      email?: string | null;
      ipSummary: string;
    }
  | {
      kind: "session";
      ipSummary: string;
      sessionCookie?: string | null;
    }
  | {
      kind: "actor";
      actorId: string;
      tenantId: string;
    }
  | {
      kind: "ip";
      ipSummary: string;
    };

export interface RateLimitConsumeInput {
  scope: RateLimitScope;
  windowLabel: string;
  identity: string;
  limit: number;
  windowMs: number;
}

export type RateLimitConsumeResult =
  | {
      allowed: true;
      key: string;
      retryAfterSeconds: number;
    }
  | {
      allowed: false;
      key: string;
      retryAfterSeconds: number;
    };

export interface RateLimitStore {
  increment(input: {
    key: string;
    ttlMs: number;
    now: number;
    windowMs: number;
  }): Promise<{ count: number; resetAt: number }>;
}
