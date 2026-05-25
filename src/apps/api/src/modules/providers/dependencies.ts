import type {
  ApiRateLimiter,
  AuditService,
  AuthService,
  ProviderConfigApiService,
  ProviderTransportKeyService,
} from "../../contracts";

export interface ProviderRouteDependencies {
  allowedOrigins: string[];
  auditService: AuditService;
  authService: AuthService;
  providerConfigService: ProviderConfigApiService;
  providerTransportKeyService: ProviderTransportKeyService;
  rateLimiter: ApiRateLimiter;
}
