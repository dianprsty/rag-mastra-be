import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { ingestDocument } from '../rag/ingest.js';

const processAndIngestStep = createStep({
  id: 'process-and-ingest-doc',
  description: 'Ingest raw text or markdown into vector database chunks',
  inputSchema: z.object({
    text: z.string().describe('Content to ingest'),
    source: z.string().describe('Source identifier'),
    title: z.string().optional().describe('Title of document'),
    format: z.enum(['markdown', 'text']).default('text'),
    embeddingModel: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    documentId: z.string(),
    title: z.string(),
    chunksIngested: z.number(),
    embeddingModel: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Missing input data for ingestion step.');
    }
    return await ingestDocument(inputData);
  },
});

export const indexDocWorkflow = createWorkflow({
  id: 'index-document-workflow',
  inputSchema: z.object({
    text: z.string(),
    source: z.string(),
    title: z.string().optional(),
    format: z.enum(['markdown', 'text']).default('text'),
    embeddingModel: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    documentId: z.string(),
    title: z.string(),
    chunksIngested: z.number(),
    embeddingModel: z.string(),
  }),
}).then(processAndIngestStep);

indexDocWorkflow.commit();
