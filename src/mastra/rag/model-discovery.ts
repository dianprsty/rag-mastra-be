export interface DiscoveredModel {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  isFree?: boolean;
}

export interface ModelDiscoveryResponse {
  chatModels: DiscoveredModel[];
  embeddingModels: DiscoveredModel[];
}

let cachedModels: ModelDiscoveryResponse | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export function getFallbackModels(): ModelDiscoveryResponse {
  return {
    chatModels: [
      { id: "openrouter/inclusionai/ling-3.0-flash:free", name: "Ling 3.0 Flash (Free)", provider: "OpenRouter", isFree: true },
      { id: "openrouter/openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
      { id: "openrouter/openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
      { id: "openrouter/anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
      { id: "openrouter/google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", provider: "Google" },
      { id: "openrouter/deepseek/deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek" },
    ],
    embeddingModels: [
      { id: "openrouter/text-embedding-3-small", name: "Text Embedding 3 Small (1536d) [Standardized]", provider: "OpenAI" },
    ],

  };
}

export async function getLiveModels(): Promise<ModelDiscoveryResponse> {
  const now = Date.now();
  if (cachedModels && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = (await response.json()) as { data?: Array<{ id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }> };

    const chatModels: DiscoveredModel[] = [];
    const embeddingModels: DiscoveredModel[] = [];

    for (const model of data.data || []) {
      const isEmbedding = model.id.includes("embed");
      const provider = model.id.split("/")[0] || "OpenRouter";

      const formattedModel: DiscoveredModel = {
        id: `openrouter/${model.id}`,
        name: model.name || model.id,
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
        contextLength: model.context_length,
        isFree: model.pricing?.prompt === "0" && model.pricing?.completion === "0",
      };

      if (isEmbedding) {
        embeddingModels.push(formattedModel);
      } else {
        chatModels.push(formattedModel);
      }
    }

    if (chatModels.length === 0) {
      return getFallbackModels();
    }

    // Sort: Free models first, then alphabetical
    chatModels.sort((a, b) => (b.isFree ? 1 : 0) - (a.isFree ? 1 : 0) || a.name.localeCompare(b.name));

    cachedModels = { chatModels, embeddingModels: getFallbackModels().embeddingModels };

    lastFetchTime = now;
    return cachedModels;
  } catch (error) {
    console.warn("[ModelDiscovery] Failed to fetch live models from OpenRouter, using fallback models.", error);
    return getFallbackModels();
  }
}
