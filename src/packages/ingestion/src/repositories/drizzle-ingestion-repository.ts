import type {
  DrizzleIngestionRepositoryOptions,
  IngestionCleanupRepository,
  IngestionPipelineRepository,
  IngestionRecoveryRepository,
} from "../contracts/types";
import { createDrizzlePipelineRepository } from "./drizzle-pipeline-repository";
import { createDrizzleRecoveryRepository } from "./drizzle-recovery-repository";
import { createDrizzleSourceCleanupRepository } from "./drizzle-source-cleanup-repository";

export function createDrizzleIngestionRepository(
  options: DrizzleIngestionRepositoryOptions,
): IngestionPipelineRepository &
  IngestionRecoveryRepository &
  IngestionCleanupRepository {
  return {
    ...createDrizzlePipelineRepository(options),
    ...createDrizzleRecoveryRepository(options),
    ...createDrizzleSourceCleanupRepository(options),
  };
}
