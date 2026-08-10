import { createHash } from 'node:crypto';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { PDFParse } from 'pdf-parse';

import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSION } from './config.js';
import { vectorStore, RAG_INDEX_NAME } from '../vector-store-factory.js';

function generateVectorId(source: string, chunkIndex: number): string {
  return createHash('sha256').update(`${source}:${chunkIndex}`).digest('hex');
}

export async function ensureVectorIndex(dimension: number = EMBEDDING_DIMENSION): Promise<void> {
  try {
    const indexes = await vectorStore.listIndexes();
    if (!indexes.includes(RAG_INDEX_NAME)) {
      await vectorStore.createIndex({
        indexName: RAG_INDEX_NAME,
        dimension,
        metric: 'cosine',
      });
    }
  } catch (error) {
    console.warn('[Ingest] Index creation check:', error);
  }
}

export interface IngestedDocInfo {
  id: string;
  title: string;
  source: string;
  format: string;
  chunksCount: number;
  ingestedAt: string;
  summarySnippet?: string;
}

const ingestedDocsRegistry: IngestedDocInfo[] = [
  {
    id: 'spiceuptheworld.pdf',
    title: 'Spice Up The World PDF Guide',
    source: 'spiceuptheworld.pdf',
    format: 'pdf',
    chunksCount: 20,
    ingestedAt: new Date().toISOString(),
    summarySnippet: 'Detailed spice blend guide, recipes, background history, and culinary pairings.',
  },
  {
    id: 'knowledge/mastra-rag.md',
    title: 'Mastra RAG Framework Guide',
    source: 'knowledge/mastra-rag.md',
    format: 'markdown',
    chunksCount: 3,
    ingestedAt: new Date().toISOString(),
    summarySnippet: 'Overview of Mastra RAG framework, vector store setup, chunking strategies, and query pipelines.',
  },
];

export function getIngestedDocumentsList(): IngestedDocInfo[] {
  return ingestedDocsRegistry;
}

export interface IngestDocumentParams {
  text: string;
  source: string;
  title?: string;
  format?: 'markdown' | 'text' | 'pdf';
  embeddingModel?: string;
  pdfBase64?: string;
}


export async function ingestDocument(params: IngestDocumentParams) {
  const { text, source, title = source, format = 'text', pdfBase64 } = params;
  const embeddingModel = DEFAULT_EMBEDDING_MODEL;


  await ensureVectorIndex();

  let contentToChunk = text;

  // Handle PDF parsing if PDF format or base64 payload is provided
  if (format === 'pdf' || pdfBase64) {
    try {
      const base64Data = pdfBase64 || (text.includes('base64,') ? text.split('base64,')[1] : text);
      const data = new Uint8Array(Buffer.from(base64Data, 'base64'));
      const parser = new PDFParse({ data });
      const textResult = await parser.getText();
      contentToChunk = textResult.text;
      await parser.destroy();
    } catch (err: any) {
      throw new Error(`Failed to parse PDF document: ${err.message || err}`);
    }
  }

  if (!contentToChunk || !contentToChunk.trim()) {
    throw new Error('Document content is empty after extraction.');
  }

  const doc = format === 'markdown'
    ? MDocument.fromMarkdown(contentToChunk, { source, title })
    : MDocument.fromText(contentToChunk, { source, title });

  const chunks = await doc.chunk({
    strategy: 'recursive',
    maxSize: 512,
    overlap: 50,
    separators: ['\n\n', '\n', ' '],
  });

  if (!chunks || chunks.length === 0) {
    throw new Error('No content chunks extracted from document.');
  }

  const modelRouter = new ModelRouterEmbeddingModel(embeddingModel);
  const chunkTexts = chunks.map((c) => c.text);

  const { embeddings } = await embedMany({
    model: modelRouter,
    values: chunkTexts,
  });

  const ids = chunks.map((_, i) => generateVectorId(source, i));
  const metadata = chunks.map((chunk, i) => ({
    text: chunk.text,
    source,
    title,
    chunkIndex: i,
    totalChunks: chunks.length,
    embeddingModel,
  }));

  await vectorStore.upsert({
    indexName: RAG_INDEX_NAME,
    vectors: embeddings,
    ids,
    metadata,
  });

  const newDocInfo: IngestedDocInfo = {
    id: source,
    title,
    source,
    format,
    chunksCount: chunks.length,
    ingestedAt: new Date().toISOString(),
    summarySnippet: contentToChunk.slice(0, 150) + '...',
  };

  // Prevent duplicate registry items
  const existingIdx = ingestedDocsRegistry.findIndex((d) => d.id === source || d.source === source);
  if (existingIdx >= 0) {
    ingestedDocsRegistry[existingIdx] = newDocInfo;
  } else {
    ingestedDocsRegistry.unshift(newDocInfo);
  }

  return {
    success: true,
    documentId: source,
    title,
    chunksIngested: chunks.length,
    embeddingModel,
  };

}
