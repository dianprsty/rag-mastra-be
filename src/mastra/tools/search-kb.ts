import { createTool } from '@mastra/core/tools';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { embed } from 'ai';
import { z } from 'zod';

import { DEFAULT_EMBEDDING_MODEL } from '../rag/config.js';
import { vectorStore, RAG_INDEX_NAME } from '../vector-store-factory.js';

export const searchKnowledgeBaseTool = createTool({
  id: 'searchKnowledgeBase',
  description: 'Search the knowledge base for relevant context and return numbered bracketed citations [1], [2]. Always cite claims using these exact citation markers.',
  inputSchema: z.object({
    queryText: z.string().describe('The user question or query to search in the knowledge base'),
    topK: z.number().min(1).max(10).default(5).describe('Number of relevant chunks to retrieve'),
    embeddingModel: z.string().optional().describe('Embedding model used for query vector generation'),
  }),
  outputSchema: z.object({
    relevantContext: z.string(),
    citations: z.array(
      z.object({
        number: z.string(),
        title: z.string(),
        source: z.string(),
        chunkIndex: z.number().optional(),
        quote: z.string(),
        score: z.number().optional(),
      })
    ),
  }),
  execute: async ({ queryText, topK }) => {
    const modelRouter = new ModelRouterEmbeddingModel(DEFAULT_EMBEDDING_MODEL);

    const { embedding } = await embed({
      value: queryText,
      model: modelRouter,
    });


    const results = await vectorStore.query({
      indexName: RAG_INDEX_NAME,
      queryVector: embedding,
      topK,
    });

    const citations = results.map((result, index) => {
      const metadata = result.metadata || {};
      const source = (metadata.source as string) || result.id;
      const title = (metadata.title as string) || source;
      const text = (metadata.text as string) || (result.document as string) || '';

      return {
        number: String(index + 1),
        title,
        source,
        chunkIndex: typeof metadata.chunkIndex === 'number' ? metadata.chunkIndex : undefined,
        quote: text.replace(/\s+/g, ' ').trim().slice(0, 300),
        score: result.score,
      };
    });

    const relevantContext = citations
      .map((c) => {
        const chunkInfo = c.chunkIndex !== undefined ? ` (chunk ${c.chunkIndex})` : '';
        return `[${c.number}] Source: ${c.title}${chunkInfo}\n${c.quote}`;
      })
      .join('\n\n');

    return { relevantContext, citations };
  },
});
