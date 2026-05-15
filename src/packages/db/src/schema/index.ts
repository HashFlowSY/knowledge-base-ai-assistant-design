export * from "./audit";
export * from "./auth";
export * from "./common";
export * from "./ingestion";
export * from "./knowledge";
export * from "./provider";
export * from "./rag";
export * from "./system";
export * from "./tenant";

import * as auditSchema from "./audit";
import * as authSchema from "./auth";
import * as ingestionSchema from "./ingestion";
import * as knowledgeSchema from "./knowledge";
import * as providerSchema from "./provider";
import * as ragSchema from "./rag";
import * as systemSchema from "./system";
import * as tenantSchema from "./tenant";

export const schema = {
  ...auditSchema,
  ...authSchema,
  ...ingestionSchema,
  ...knowledgeSchema,
  ...providerSchema,
  ...ragSchema,
  ...systemSchema,
  ...tenantSchema,
};
