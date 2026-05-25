import type { Logger } from "@kb/observability";

export interface ApiContextVariables {
  logger: Logger;
  requestId: string;
}

export interface ApiEnv {
  Variables: ApiContextVariables;
}
