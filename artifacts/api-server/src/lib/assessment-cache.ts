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
export const ASSESSMENT_CACHE_TTL_MS = 5 * 60 * 1000;

export function getCachedAssessment(): { result: AiAssessmentResult; cachedAt: Date } | null {
  return _cache;
}

export function setCachedAssessment(result: AiAssessmentResult): void {
  _cache = { result, cachedAt: new Date() };
}
