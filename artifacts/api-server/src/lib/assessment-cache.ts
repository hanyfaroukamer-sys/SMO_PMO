import { db } from "@workspace/db";
import { spmoProgrammeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type AiAssessmentResult = {
  overallHealth: string;
  summary: string;
  pillarInsights: Array<{
    pillarId: number;
    pillarName: string;
    insight: string;
    sentiment: string;
  }>;
  recommendations: string[];
  riskFlags: string[];
  cachedAt: Date;
};

let _cache: { result: AiAssessmentResult; cachedAt: Date } | null = null;
export const ASSESSMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedAssessment(): Promise<{ result: AiAssessmentResult; cachedAt: Date } | null> {
  if (_cache) return _cache;
  try {
    const [cfg] = await db.select().from(spmoProgrammeConfigTable).limit(1);
    if (cfg?.lastAiAssessment && cfg?.lastAiAssessmentAt) {
      const stored = cfg.lastAiAssessment as AiAssessmentResult;
      stored.cachedAt = cfg.lastAiAssessmentAt;
      _cache = { result: stored, cachedAt: cfg.lastAiAssessmentAt };
      return _cache;
    }
  } catch {}
  return null;
}

export async function setCachedAssessment(result: AiAssessmentResult): Promise<void> {
  const now = new Date();
  _cache = { result, cachedAt: now };
  try {
    await db.update(spmoProgrammeConfigTable)
      .set({ lastAiAssessment: result, lastAiAssessmentAt: now })
      .where(eq(spmoProgrammeConfigTable.id, 1));
  } catch {}
}
