import type { ApiRateLimiter, AuthService } from "../../contracts";

export interface AuthRouteDependencies {
  allowedOrigins: string[];
  authService: AuthService;
  rateLimiter: ApiRateLimiter;
}
