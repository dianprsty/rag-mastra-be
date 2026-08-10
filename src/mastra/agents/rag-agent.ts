import { Agent } from '@mastra/core/agent';
import { DEFAULT_CHAT_MODEL } from '../rag/config.js';
import { searchKnowledgeBaseTool } from '../tools/search-kb.js';

export const ragAgent = new Agent({
  id: 'rag-agent',
  name: 'Mastra RAG Assistant',
  instructions: `You are an expert RAG AI assistant. You answer user questions using only factual knowledge retrieved from the knowledge base.

Rules:
1. Always search the knowledge base using the searchKnowledgeBase tool first.
2. Base your answer strictly on the retrieved context.
3. Cite factual statements inline using the exact bracketed citation IDs (e.g., [1], [2]) returned by the search tool.
4. Do NOT fabricate facts, quotes, or citations not present in the search results.
5. If the retrieved context does not contain enough information to answer the question, state clearly that the knowledge base does not have the answer.`,
  model: DEFAULT_CHAT_MODEL,
  tools: { searchKnowledgeBaseTool },
});
