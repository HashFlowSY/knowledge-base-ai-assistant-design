import type { ApiRateLimiter, AuthService, ChatService } from "../../contracts";

export interface ChatRouteDependencies {
  allowedOrigins: string[];
  authService: AuthService;
  chatService: ChatService;
  rateLimiter: ApiRateLimiter;
}
