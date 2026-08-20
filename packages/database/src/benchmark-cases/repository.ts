import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AgentBenchDatabase } from "../client";
import {
  benchmarkCaseRevisions,
  benchmarkCases,
  type BenchmarkProvider,
  type JsonValue,
} from "../schema/index";

export type BenchmarkCaseRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  provider: BenchmarkProvider | null;
  currentRevisionId: string | null;
  metadata: JsonValue;
  isPublic: boolean;
  createdAt: string;
};

export type PublicHostedBenchmarkCaseRecord = Pick<
  BenchmarkCaseRecord,
  "id" | "slug" | "title" | "description" | "difficulty" | "createdAt"
>;

export type CalibrationBenchmarkRevisionRecord = {
  caseId: string;
  currentRevisionId: string | null;
  id: string;
  revision: string;
  manifest: JsonValue;
  createdAt: string;
};

export type BenchmarkCaseRevisionRecord = {
  id: string;
  caseId: string;
  revision: string;
  contentHash: string;
  manifest: JsonValue;
  createdAt: string;
};

export type BenchmarkCaseReadRepository = {
  listAll: () => Promise<BenchmarkCaseRecord[]>;
  listPublicHosted: () => Promise<PublicHostedBenchmarkCaseRecord[]>;
  listCalibrationRevisions: (caseIds: string[]) => Promise<CalibrationBenchmarkRevisionRecord[]>;
  revisionExists: (caseId: string, revisionId: string) => Promise<boolean>;
  findRevisionById: (revisionId: string) => Promise<BenchmarkCaseRevisionRecord | null>;
  findByIdOrSlug: (identity: string) => Promise<BenchmarkCaseRecord | null>;
};

export type BenchmarkCaseCatalogPublication = {
  benchmarkCase: JsonValue;
  revision: string;
  manifest: JsonValue;
  contentHash: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const benchmarkCaseSelection = {
  id: benchmarkCases.id,
  slug: benchmarkCases.slug,
  title: benchmarkCases.title,
  description: benchmarkCases.description,
  category: benchmarkCases.category,
  difficulty: benchmarkCases.difficulty,
  provider: benchmarkCases.provider,
  currentRevisionId: benchmarkCases.currentRevisionId,
  metadata: benchmarkCases.metadata,
  isPublic: benchmarkCases.isPublic,
  createdAt: benchmarkCases.createdAt,
};

export function createBenchmarkCaseReadRepository(
  db: AgentBenchDatabase,
): BenchmarkCaseReadRepository {
  return {
    listAll() {
      return db
        .select(benchmarkCaseSelection)
        .from(benchmarkCases)
        .orderBy(desc(benchmarkCases.createdAt));
    },

    listPublicHosted() {
      return db
        .select({
          id: benchmarkCases.id,
          slug: benchmarkCases.slug,
          title: benchmarkCases.title,
          description: benchmarkCases.description,
          difficulty: benchmarkCases.difficulty,
          createdAt: benchmarkCases.createdAt,
        })
        .from(benchmarkCases)
        .where(and(
          eq(benchmarkCases.isPublic, true),
          eq(benchmarkCases.provider, "hosted-web"),
        ))
        .orderBy(desc(benchmarkCases.difficulty), benchmarkCases.createdAt);
    },

    listCalibrationRevisions(caseIds) {
      if (caseIds.length === 0) return Promise.resolve([]);
      return db
        .select({
          caseId: benchmarkCaseRevisions.caseId,
          currentRevisionId: benchmarkCases.currentRevisionId,
          id: benchmarkCaseRevisions.id,
          revision: benchmarkCaseRevisions.revision,
          manifest: benchmarkCaseRevisions.manifest,
          createdAt: benchmarkCaseRevisions.createdAt,
        })
        .from(benchmarkCaseRevisions)
        .innerJoin(benchmarkCases, eq(benchmarkCases.id, benchmarkCaseRevisions.caseId))
        .where(and(
          inArray(benchmarkCaseRevisions.caseId, caseIds),
          eq(benchmarkCases.isPublic, true),
          eq(benchmarkCases.provider, "hosted-web"),
        ))
        .orderBy(desc(benchmarkCaseRevisions.createdAt));
    },

    async revisionExists(caseId, revisionId) {
      const [row] = await db
        .select({ id: benchmarkCaseRevisions.id })
        .from(benchmarkCaseRevisions)
        .where(and(
          eq(benchmarkCaseRevisions.id, revisionId),
          eq(benchmarkCaseRevisions.caseId, caseId),
        ))
        .limit(1);
      return Boolean(row);
    },

    async findRevisionById(revisionId) {
      const [row] = await db
        .select({
          id: benchmarkCaseRevisions.id,
          caseId: benchmarkCaseRevisions.caseId,
          revision: benchmarkCaseRevisions.revision,
          contentHash: benchmarkCaseRevisions.contentHash,
          manifest: benchmarkCaseRevisions.manifest,
          createdAt: benchmarkCaseRevisions.createdAt,
        })
        .from(benchmarkCaseRevisions)
        .where(eq(benchmarkCaseRevisions.id, revisionId))
        .limit(1);
      return row ?? null;
    },

    async findByIdOrSlug(identity) {
      const [row] = await db
        .select(benchmarkCaseSelection)
        .from(benchmarkCases)
        .where(uuidPattern.test(identity)
          ? eq(benchmarkCases.id, identity)
          : eq(benchmarkCases.slug, identity))
        .limit(1);
      return row ?? null;
    },
  };
}

export function createBenchmarkCaseCatalogRepository(db: AgentBenchDatabase) {
  return {
    async publish(input: BenchmarkCaseCatalogPublication) {
      const result = await db.execute<{ revision_id: string }>(sql`
        select public.publish_benchmark_case_catalog(
          ${JSON.stringify(input.benchmarkCase)}::jsonb,
          ${input.revision}::text,
          ${JSON.stringify(input.manifest)}::jsonb,
          ${input.contentHash}::text
        ) as revision_id
      `);
      const revisionId = result.rows[0]?.revision_id;
      if (!revisionId) throw new Error(`Catalog publication returned no revision for ${input.revision}.`);
      return revisionId;
    },
  };
}
