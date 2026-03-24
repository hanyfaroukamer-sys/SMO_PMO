import Anthropic from "@anthropic-ai/sdk";

const directKey = process.env.ANTHROPIC_API_KEY;
const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

if (!directKey && !integrationKey) {
  throw new Error(
    "Either ANTHROPIC_API_KEY or AI_INTEGRATIONS_ANTHROPIC_API_KEY must be set.",
  );
}

export const anthropic = directKey
  ? new Anthropic({ apiKey: directKey })
  : new Anthropic({
      apiKey: integrationKey!,
      baseURL: integrationBaseUrl,
    });
