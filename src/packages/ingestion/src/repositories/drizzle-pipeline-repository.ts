import type {
  DrizzleIngestionRepositoryOptions,
  IngestionPipelineRepository,
} from "../contracts/types";
import { createDrizzleFileJobRepository } from "./drizzle-file-job-repository";
import { createDrizzleFileSourceRepository } from "./drizzle-file-source-repository";
import { createDrizzleIngestionOutputRepository } from "./drizzle-ingestion-output-repository";

export function createDrizzlePipelineRepository(
  options: DrizzleIngestionRepositoryOptions,
): IngestionPipelineRepository {
  return {
    ...createDrizzleFileJobRepository(options),
    ...createDrizzleFileSourceRepository(options),
    ...createDrizzleIngestionOutputRepository(options),
  };
}
