import type {
  ApiRateLimiter,
  AuditService,
  AuthService,
  UserService,
} from "../../contracts";

export interface UserRouteDependencies {
  allowedOrigins: string[];
  auditService: AuditService;
  authService: AuthService;
  rateLimiter: ApiRateLimiter;
  userService: UserService;
}
