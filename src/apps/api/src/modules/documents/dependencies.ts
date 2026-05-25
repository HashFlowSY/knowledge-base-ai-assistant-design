import type {
  ApiRateLimiter,
  AuditService,
  AuthService,
  DocumentService,
  UploadConcurrencyLimiter,
  UploadConfig,
} from "../../contracts";

export interface DocumentsRouteDependencies {
  allowedOrigins: string[];
  auditService: AuditService;
  authService: AuthService;
  documentService: DocumentService;
  rateLimiter: ApiRateLimiter;
  uploadConcurrencyLimiter: UploadConcurrencyLimiter;
  uploadConfig: UploadConfig;
}
