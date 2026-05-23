import type {
  ApiRateLimiter,
  AuditService,
  AuthService,
  KnowledgeBaseService,
} from "../../contracts";

export interface KnowledgeBaseRouteDependencies {
  allowedOrigins: string[];
  auditService: AuditService;
  authService: AuthService;
  knowledgeBaseService: KnowledgeBaseService;
  rateLimiter: ApiRateLimiter;
}
