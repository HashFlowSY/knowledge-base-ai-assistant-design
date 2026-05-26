import type { ApiRateLimiter, AuthService, ChatService } from "../../contracts";

export interface ChatRouteDependencies {
  authService: AuthService;
  chatService: ChatService;
  rateLimiter: ApiRateLimiter;
}
