import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  authUsers,
  chunkEmbeddings,
  documentChunks,
  documents,
  documentSources,
  ingestionJobLogs,
  ingestionJobs,
  knowledgeBaseMembers,
  knowledgeBases,
  tenantMemberships,
  type ProjectDb,
} from "@kb/db";

import type {
  DocumentProcessingListQuery,
  KnowledgeBaseListQuery,
} from "../contracts/schemas";
import type {
  DocumentProcessingDocumentRow,
  DocumentProcessingJobRow,
  DocumentProcessingSourceRow,
  KnowledgeBaseMemberRow,
  KnowledgeBaseRow,
} from "./mappers";
import type { KnowledgeActor } from "./types";

export type ProjectDbTransaction = Parameters<Parameters<ProjectDb["transaction"]>[0]>[0];

export type KnowledgeDb = ProjectDb | ProjectDbTransaction;

export function createVisibleKnowledgeBaseConditions(
  actor: KnowledgeActor,
  query?: Pick<KnowledgeBaseListQuery, "search">,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(knowledgeBases.tenantId, actor.tenant.id),
    isNull(knowledgeBases.deletedAt),
  ];

  if (actor.role === "member") {
    conditions.push(
      sql`exists (
        select 1
        from ${knowledgeBaseMembers}
        where ${knowledgeBaseMembers.tenantId} = ${knowledgeBases.tenantId}
          and ${knowledgeBaseMembers.knowledgeBaseId} = ${knowledgeBases.id}
          and ${knowledgeBaseMembers.userId} = ${actor.user.id}
      )`,
    );
  }

  if (query?.search !== undefined) {
    const pattern = `%${query.search}%`;
    const searchCondition = or(
      ilike(knowledgeBases.name, pattern),
      ilike(knowledgeBases.description, pattern),
    );
    if (searchCondition !== undefined) {
      conditions.push(searchCondition);
    }
  }

  return conditions;
}

export async function listVisibleKnowledgeBaseRows(
  db: KnowledgeDb,
  input: { actor: KnowledgeActor; query: KnowledgeBaseListQuery },
): Promise<{ items: KnowledgeBaseRow[]; total: number }> {
  const conditions = createVisibleKnowledgeBaseConditions(input.actor, input.query);
  const offset = (input.query.page - 1) * input.query.pageSize;
  const orderBy =
    input.query.sort === "name"
      ? [asc(knowledgeBases.name), asc(knowledgeBases.id)]
      : [desc(knowledgeBases.updatedAt), asc(knowledgeBases.id)];

  const [items, totalRows] = await Promise.all([
    db
      .select({
        createdAt: knowledgeBases.createdAt,
        description: knowledgeBases.description,
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        updatedAt: knowledgeBases.updatedAt,
      })
      .from(knowledgeBases)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(input.query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(knowledgeBases)
      .where(and(...conditions)),
  ]);

  return {
    items,
    total: totalRows[0]?.value ?? 0,
  };
}

export async function findVisibleKnowledgeBaseRow(
  db: KnowledgeDb,
  input: { actor: KnowledgeActor; knowledgeBaseId: string },
): Promise<KnowledgeBaseRow | null> {
  const rows = await db
    .select({
      createdAt: knowledgeBases.createdAt,
      description: knowledgeBases.description,
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      updatedAt: knowledgeBases.updatedAt,
    })
    .from(knowledgeBases)
    .where(
      and(
        ...createVisibleKnowledgeBaseConditions(input.actor),
        eq(knowledgeBases.id, input.knowledgeBaseId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function findTenantKnowledgeBaseRow(
  db: KnowledgeDb,
  input: { tenantId: string; knowledgeBaseId: string },
): Promise<KnowledgeBaseRow | null> {
  const rows = await db
    .select({
      createdAt: knowledgeBases.createdAt,
      description: knowledgeBases.description,
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      updatedAt: knowledgeBases.updatedAt,
    })
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.tenantId, input.tenantId),
        eq(knowledgeBases.id, input.knowledgeBaseId),
        isNull(knowledgeBases.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function actorIsKnowledgeBaseMember(
  db: KnowledgeDb,
  input: { actorId: string; knowledgeBaseId: string; tenantId: string },
): Promise<boolean> {
  const rows = await db
    .select({ id: knowledgeBaseMembers.id })
    .from(knowledgeBaseMembers)
    .where(
      and(
        eq(knowledgeBaseMembers.tenantId, input.tenantId),
        eq(knowledgeBaseMembers.knowledgeBaseId, input.knowledgeBaseId),
        eq(knowledgeBaseMembers.userId, input.actorId),
      ),
    )
    .limit(1);

  return rows[0] !== undefined;
}

export async function findDuplicateKnowledgeBaseName(
  db: KnowledgeDb,
  input: { excludeKnowledgeBaseId?: string; normalizedName: string; tenantId: string },
): Promise<{ id: string } | null> {
  const conditions: SQL<unknown>[] = [
    eq(knowledgeBases.tenantId, input.tenantId),
    isNull(knowledgeBases.deletedAt),
    sql`lower(trim(${knowledgeBases.name})) = ${input.normalizedName}`,
  ];

  if (input.excludeKnowledgeBaseId !== undefined) {
    conditions.push(ne(knowledgeBases.id, input.excludeKnowledgeBaseId));
  }

  const rows = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

export async function listKnowledgeBaseMemberRows(
  db: KnowledgeDb,
  input: { knowledgeBaseIds: string[]; tenantId: string },
): Promise<KnowledgeBaseMemberRow[]> {
  if (input.knowledgeBaseIds.length === 0) {
    return [];
  }

  return db
    .select({
      email: authUsers.email,
      id: authUsers.id,
      knowledgeBaseId: knowledgeBaseMembers.knowledgeBaseId,
      name: authUsers.name,
    })
    .from(knowledgeBaseMembers)
    .innerJoin(authUsers, eq(authUsers.id, knowledgeBaseMembers.userId))
    .innerJoin(
      tenantMemberships,
      and(
        eq(tenantMemberships.userId, authUsers.id),
        eq(tenantMemberships.tenantId, input.tenantId),
        eq(tenantMemberships.isActive, true),
        eq(tenantMemberships.role, "member"),
      ),
    )
    .where(
      and(
        eq(knowledgeBaseMembers.tenantId, input.tenantId),
        inArray(knowledgeBaseMembers.knowledgeBaseId, input.knowledgeBaseIds),
      ),
    )
    .orderBy(asc(authUsers.name), asc(authUsers.id));
}

export async function listKnowledgeBaseDocumentCounts(
  db: KnowledgeDb,
  input: { knowledgeBaseIds: string[]; tenantId: string },
): Promise<Map<string, number>> {
  if (input.knowledgeBaseIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      knowledgeBaseId: documents.knowledgeBaseId,
      value: count(),
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, input.tenantId),
        isNull(documents.deletedAt),
        inArray(documents.knowledgeBaseId, input.knowledgeBaseIds),
      ),
    )
    .groupBy(documents.knowledgeBaseId);

  return new Map(rows.map((row) => [row.knowledgeBaseId, row.value]));
}

interface DocumentProcessingJobQueryRow extends DocumentProcessingJobRow {
  createdAt: Date;
  documentId: string;
  queuedAt: Date;
  sourceHash: string | null;
}

interface DocumentProcessingSourceQueryRow extends DocumentProcessingSourceRow {
  documentId: string;
  sourceHash: string;
  updatedAt: Date;
}

interface DocumentProcessingLogProgress {
  chunkCount?: number;
  embeddedCount?: number;
}

type DocumentProcessingCountValue = number | string | bigint;
type OptionalDocumentProcessingCountValue = DocumentProcessingCountValue | null;

export interface DocumentProcessingSummaryRow {
  document: DocumentProcessingDocumentRow;
  job: DocumentProcessingJobRow | null;
  progress: {
    chunkCount: number | null;
    embeddedCount: number | null;
  };
  source: DocumentProcessingSourceRow | null;
}

export async function listKnowledgeBaseDocumentProcessingSummaries(
  db: KnowledgeDb,
  input: {
    documentId?: string;
    knowledgeBaseId: string;
    query: DocumentProcessingListQuery;
    tenantId: string;
  },
): Promise<{ items: DocumentProcessingSummaryRow[]; total: number }> {
  const documentConditions: SQL<unknown>[] = [
    eq(documents.tenantId, input.tenantId),
    eq(documents.knowledgeBaseId, input.knowledgeBaseId),
    isNull(documents.deletedAt),
  ];
  if (input.documentId !== undefined) {
    documentConditions.push(eq(documents.id, input.documentId));
  }
  const offset = (input.query.page - 1) * input.query.pageSize;

  const [documentRows, totalRows] = await Promise.all([
    db
      .select({
        currentVersion: documents.currentVersion,
        id: documents.id,
        status: documents.status,
        title: documents.title,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(and(...documentConditions))
      .orderBy(desc(documents.updatedAt), asc(documents.id))
      .limit(input.query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(documents)
      .where(and(...documentConditions)),
  ]);

  const documentIds = documentRows.map((document) => document.id);
  if (documentIds.length === 0) {
    return {
      items: [],
      total: totalRows[0]?.value ?? 0,
    };
  }

  const [jobRows, sourceRows] = await Promise.all([
    listDocumentProcessingJobRows(db, {
      documentIds,
      knowledgeBaseId: input.knowledgeBaseId,
      tenantId: input.tenantId,
    }),
    listDocumentProcessingSourceRows(db, {
      documentIds,
      knowledgeBaseId: input.knowledgeBaseId,
      tenantId: input.tenantId,
    }),
  ]);

  const latestJobByDocumentId = selectLatestJobByDocumentId(jobRows);
  const progressStartedAtByDocumentId =
    createProgressStartedAtByDocumentId(latestJobByDocumentId);
  const latestJobs = Array.from(latestJobByDocumentId.values());
  const [persistedChunkCountRows, persistedEmbeddingCountRows, progressByJobId] =
    await Promise.all([
      listPersistedCurrentChunkCounts(db, {
        documentIds,
        knowledgeBaseId: input.knowledgeBaseId,
        progressStartedAtByDocumentId,
        tenantId: input.tenantId,
      }),
      listPersistedCurrentEmbeddingCounts(db, {
        documentIds,
        knowledgeBaseId: input.knowledgeBaseId,
        progressStartedAtByDocumentId,
        tenantId: input.tenantId,
      }),
      latestJobs.length === 0
        ? new Map<string, DocumentProcessingLogProgress>()
        : listDocumentProcessingLogProgress(db, {
            jobs: latestJobs.map((job) => ({
              id: job.id,
              queuedAt: job.queuedAt,
            })),
            tenantId: input.tenantId,
          }),
    ]);

  const sourceLookup = createSourceLookup(sourceRows);

  return {
    items: documentRows.map((document) => {
      const job = latestJobByDocumentId.get(document.id) ?? null;
      const source = selectDocumentProcessingSource({
        document,
        job,
        sourceLookup,
      });
      const logProgress = job === null ? undefined : progressByJobId.get(job.id);
      const persistedChunkCount = persistedChunkCountRows.get(document.id);
      const persistedEmbeddedCount = persistedEmbeddingCountRows.get(document.id);

      return {
        document,
        job,
        progress: {
          chunkCount: logProgress?.chunkCount ?? persistedChunkCount ?? null,
          embeddedCount: logProgress?.embeddedCount ?? persistedEmbeddedCount ?? null,
        },
        source,
      };
    }),
    total: totalRows[0]?.value ?? 0,
  };
}

async function listDocumentProcessingJobRows(
  db: KnowledgeDb,
  input: { documentIds: string[]; knowledgeBaseId: string; tenantId: string },
): Promise<DocumentProcessingJobQueryRow[]> {
  return db
    .select({
      attempts: ingestionJobs.attempts,
      createdAt: ingestionJobs.createdAt,
      currentStep: ingestionJobs.currentStep,
      documentId: ingestionJobs.documentId,
      id: ingestionJobs.id,
      lastErrorCode: ingestionJobs.lastErrorCode,
      lastErrorMessage: ingestionJobs.lastErrorMessage,
      maxAttempts: ingestionJobs.maxAttempts,
      queuedAt: ingestionJobs.queuedAt,
      sourceHash: ingestionJobs.sourceHash,
      status: ingestionJobs.status,
      updatedAt: ingestionJobs.updatedAt,
    })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.tenantId, input.tenantId),
        eq(ingestionJobs.knowledgeBaseId, input.knowledgeBaseId),
        inArray(ingestionJobs.documentId, input.documentIds),
      ),
    )
    .orderBy(
      desc(ingestionJobs.updatedAt),
      desc(ingestionJobs.createdAt),
      asc(ingestionJobs.id),
    );
}

async function listDocumentProcessingSourceRows(
  db: KnowledgeDb,
  input: { documentIds: string[]; knowledgeBaseId: string; tenantId: string },
): Promise<DocumentProcessingSourceQueryRow[]> {
  return db
    .select({
      documentId: documentSources.documentId,
      objectKey: documentSources.objectKey,
      objectCleanupStatus: documentSources.objectCleanupStatus,
      sourceHash: documentSources.sourceHash,
      sourceType: documentSources.sourceType,
      updatedAt: documentSources.updatedAt,
      uploadStatus: documentSources.uploadStatus,
    })
    .from(documentSources)
    .where(
      and(
        eq(documentSources.tenantId, input.tenantId),
        eq(documentSources.knowledgeBaseId, input.knowledgeBaseId),
        inArray(documentSources.documentId, input.documentIds),
      ),
    )
    .orderBy(desc(documentSources.updatedAt), asc(documentSources.id));
}

async function listPersistedCurrentChunkCounts(
  db: KnowledgeDb,
  input: {
    documentIds: string[];
    knowledgeBaseId: string;
    progressStartedAtByDocumentId: ReadonlyMap<string, Date>;
    tenantId: string;
  },
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      documentId: documentChunks.documentId,
      value: count(),
    })
    .from(documentChunks)
    .innerJoin(
      documents,
      and(
        eq(documents.tenantId, documentChunks.tenantId),
        eq(documents.id, documentChunks.documentId),
        eq(documents.currentVersion, documentChunks.documentVersion),
      ),
    )
    .where(
      and(
        eq(documentChunks.tenantId, input.tenantId),
        eq(documentChunks.knowledgeBaseId, input.knowledgeBaseId),
        orFromNonEmpty(
          input.documentIds.map((documentId) => {
            const progressStartedAt = input.progressStartedAtByDocumentId.get(documentId);

            if (progressStartedAt === undefined) {
              return eq(documentChunks.documentId, documentId);
            }

            return requireSqlCondition(
              and(
                eq(documentChunks.documentId, documentId),
                gte(documentChunks.createdAt, progressStartedAt),
              ),
            );
          }),
        ),
      ),
    )
    .groupBy(documentChunks.documentId);

  return new Map(
    rows.map((row) => [row.documentId, normalizeDocumentProcessingCount(row.value)]),
  );
}

async function listPersistedCurrentEmbeddingCounts(
  db: KnowledgeDb,
  input: {
    documentIds: string[];
    knowledgeBaseId: string;
    progressStartedAtByDocumentId: ReadonlyMap<string, Date>;
    tenantId: string;
  },
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      documentId: chunkEmbeddings.documentId,
      value: count(),
    })
    .from(chunkEmbeddings)
    .innerJoin(
      documentChunks,
      and(
        eq(documentChunks.tenantId, chunkEmbeddings.tenantId),
        eq(documentChunks.id, chunkEmbeddings.chunkId),
      ),
    )
    .innerJoin(
      documents,
      and(
        eq(documents.tenantId, chunkEmbeddings.tenantId),
        eq(documents.id, chunkEmbeddings.documentId),
        eq(documents.currentVersion, documentChunks.documentVersion),
      ),
    )
    .where(
      and(
        eq(chunkEmbeddings.tenantId, input.tenantId),
        eq(chunkEmbeddings.knowledgeBaseId, input.knowledgeBaseId),
        orFromNonEmpty(
          input.documentIds.map((documentId) => {
            const progressStartedAt = input.progressStartedAtByDocumentId.get(documentId);

            if (progressStartedAt === undefined) {
              return eq(chunkEmbeddings.documentId, documentId);
            }

            return requireSqlCondition(
              and(
                eq(chunkEmbeddings.documentId, documentId),
                gte(chunkEmbeddings.createdAt, progressStartedAt),
              ),
            );
          }),
        ),
      ),
    )
    .groupBy(chunkEmbeddings.documentId);

  return new Map(
    rows.map((row) => [row.documentId, normalizeDocumentProcessingCount(row.value)]),
  );
}

async function listDocumentProcessingLogProgress(
  db: KnowledgeDb,
  input: { jobs: { id: string; queuedAt: Date }[]; tenantId: string },
): Promise<Map<string, DocumentProcessingLogProgress>> {
  if (input.jobs.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      chunkCount: sql<OptionalDocumentProcessingCountValue>`
        max(case
          when (
            (
              ${ingestionJobLogs.step}::text = 'chunker'
              and ${ingestionJobLogs.message} like '%.succeeded'
            )
            or (
              ${ingestionJobLogs.step}::text = 'embedding'
              and (
                ${ingestionJobLogs.message} like '%.progress'
                or ${ingestionJobLogs.message} like '%.succeeded'
              )
            )
          )
          and ${ingestionJobLogs.metadata} ? 'chunkCount'
          and (${ingestionJobLogs.metadata}->>'chunkCount') ~ '^[0-9]+$'
          then (${ingestionJobLogs.metadata}->>'chunkCount')::bigint
          else null
        end)
      `,
      embeddedCount: sql<OptionalDocumentProcessingCountValue>`
        max(case
          when ${ingestionJobLogs.step}::text = 'embedding'
            and (
              ${ingestionJobLogs.message} like '%.progress'
              or ${ingestionJobLogs.message} like '%.succeeded'
            )
            and ${ingestionJobLogs.metadata} ? 'embeddedCount'
            and (${ingestionJobLogs.metadata}->>'embeddedCount') ~ '^[0-9]+$'
          then (${ingestionJobLogs.metadata}->>'embeddedCount')::bigint
          else null
        end)
      `,
      jobId: ingestionJobLogs.jobId,
    })
    .from(ingestionJobLogs)
    .where(
      and(
        eq(ingestionJobLogs.tenantId, input.tenantId),
        orFromNonEmpty(
          input.jobs.map((job) =>
            requireSqlCondition(
              and(
                eq(ingestionJobLogs.jobId, job.id),
                gte(ingestionJobLogs.createdAt, job.queuedAt),
              ),
            ),
          ),
        ),
        inArray(ingestionJobLogs.step, ["chunker", "embedding"]),
      ),
    )
    .groupBy(ingestionJobLogs.jobId);

  const progressByJobId = new Map<string, DocumentProcessingLogProgress>();
  for (const row of rows) {
    const progress: DocumentProcessingLogProgress = {};
    const chunkCount = normalizeOptionalDocumentProcessingCount(row.chunkCount);
    const embeddedCount = normalizeOptionalDocumentProcessingCount(row.embeddedCount);

    if (chunkCount !== undefined) {
      progress.chunkCount = chunkCount;
    }

    if (embeddedCount !== undefined) {
      progress.embeddedCount = embeddedCount;
    }

    progressByJobId.set(row.jobId, progress);
  }

  return progressByJobId;
}

function selectLatestJobByDocumentId(
  rows: DocumentProcessingJobQueryRow[],
): Map<string, DocumentProcessingJobQueryRow> {
  const latestByDocumentId = new Map<string, DocumentProcessingJobQueryRow>();
  for (const row of rows) {
    if (!latestByDocumentId.has(row.documentId)) {
      latestByDocumentId.set(row.documentId, row);
    }
  }

  return latestByDocumentId;
}

function createProgressStartedAtByDocumentId(
  latestJobByDocumentId: ReadonlyMap<string, DocumentProcessingJobQueryRow>,
): Map<string, Date> {
  return new Map(
    Array.from(latestJobByDocumentId.entries()).map(([documentId, job]) => [
      documentId,
      job.queuedAt,
    ]),
  );
}

function requireSqlCondition(condition: SQL<unknown> | undefined): SQL<unknown> {
  if (condition === undefined) {
    throw new Error("Expected a SQL condition.");
  }

  return condition;
}

function orFromNonEmpty(conditions: SQL<unknown>[]): SQL<unknown> {
  return requireSqlCondition(or(...conditions));
}

function normalizeDocumentProcessingCount(value: DocumentProcessingCountValue): number {
  const countValue = Number(value);
  if (!Number.isSafeInteger(countValue) || countValue < 0) {
    throw new Error("Invalid document processing count value.");
  }

  return countValue;
}

function normalizeOptionalDocumentProcessingCount(
  value: OptionalDocumentProcessingCountValue,
): number | undefined {
  return value === null ? undefined : normalizeDocumentProcessingCount(value);
}

function createSourceLookup(rows: DocumentProcessingSourceQueryRow[]): {
  byDocumentAndSourceHash: Map<string, DocumentProcessingSourceQueryRow>;
  latestByDocumentId: Map<string, DocumentProcessingSourceQueryRow>;
} {
  const byDocumentAndSourceHash = new Map<string, DocumentProcessingSourceQueryRow>();
  const latestByDocumentId = new Map<string, DocumentProcessingSourceQueryRow>();

  for (const row of rows) {
    byDocumentAndSourceHash.set(sourceLookupKey(row.documentId, row.sourceHash), row);
    if (!latestByDocumentId.has(row.documentId)) {
      latestByDocumentId.set(row.documentId, row);
    }
  }

  return { byDocumentAndSourceHash, latestByDocumentId };
}

function selectDocumentProcessingSource(input: {
  document: DocumentProcessingDocumentRow;
  job: DocumentProcessingJobQueryRow | null;
  sourceLookup: ReturnType<typeof createSourceLookup>;
}): DocumentProcessingSourceQueryRow | null {
  if (input.job === null) {
    return input.sourceLookup.latestByDocumentId.get(input.document.id) ?? null;
  }

  const source = input.sourceLookup.byDocumentAndSourceHash.get(
    sourceLookupKey(input.document.id, input.job.sourceHash),
  );
  if (source === undefined) {
    throw new Error("Document processing source is missing for the latest job.");
  }

  return source;
}

function sourceLookupKey(documentId: string, sourceHash: string | null): string {
  return `${documentId}:${sourceHash ?? ""}`;
}

export async function listValidMemberIds(
  db: KnowledgeDb,
  input: { memberIds: string[]; tenantId: string },
): Promise<Set<string>> {
  if (input.memberIds.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .innerJoin(
      tenantMemberships,
      and(
        eq(tenantMemberships.userId, authUsers.id),
        eq(tenantMemberships.tenantId, input.tenantId),
        eq(tenantMemberships.isActive, true),
        eq(tenantMemberships.role, "member"),
      ),
    )
    .where(inArray(authUsers.id, input.memberIds));

  return new Set(rows.map((row) => row.id));
}
