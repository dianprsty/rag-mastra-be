import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { PDFParse } from 'pdf-parse';

import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSION } from './config.js';
import { vectorStore, RAG_INDEX_NAME } from '../vector-store-factory.js';

const DB_DIR = path.resolve(process.cwd(), '.mastra');
const DB_FILE = path.join(DB_DIR, 'ingested_docs.json');

function ensureDbFile(): IngestedDocInfo[] {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const defaultSeed: IngestedDocInfo[] = [];
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultSeed, null, 2), 'utf-8');
    return defaultSeed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as IngestedDocInfo[];
  } catch {
    return [];
  }
}

function saveDb(docs: IngestedDocInfo[]) {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(docs, null, 2), 'utf-8');
}

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

export function getIngestedDocumentsList(): IngestedDocInfo[] {
  return ensureDbFile();
}

export interface IngestDocumentParams {
  text: string;
  source: string;
  title?: string;
  format?: 'markdown' | 'text' | 'pdf' | 'url';
  embeddingModel?: string;
  pdfBase64?: string;
  url?: string;
}


export async function ingestDocument(params: IngestDocumentParams) {
  const { text, source, title = source, format = 'text', pdfBase64, url } = params;
  const embeddingModel = DEFAULT_EMBEDDING_MODEL;


  await ensureVectorIndex();

  let contentToChunk = text;

  // Handle URL scraping
  if (format === 'url' && url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();
      // Clean HTML
      contentToChunk = html
        .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
        .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (err: any) {
      throw new Error(`Failed to scrape URL "${url}": ${err.message}`);
    }
  }
  // Handle PDF parsing if PDF format or base64 payload is provided
  else if (format === 'pdf' || pdfBase64) {
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
  const registry = ensureDbFile();
  const existingIdx = registry.findIndex((d) => d.id === source || d.source === source);
  if (existingIdx >= 0) {
    registry[existingIdx] = newDocInfo;
  } else {
    registry.unshift(newDocInfo);
  }
  saveDb(registry);

  return {
    success: true,
    documentId: source,
    title,
    chunksIngested: chunks.length,
    embeddingModel,
  };

}

export async function deleteIngestedDocument(documentId: string): Promise<boolean> {
  const registry = ensureDbFile();
  const doc = registry.find((d) => d.id === documentId || d.source === documentId);
  if (!doc) {
    return false;
  }

  // Deleting vectors from vectorStore using calculated deterministic vector IDs
  const idsToDelete = Array.from({ length: doc.chunksCount }, (_, i) =>
    generateVectorId(doc.source, i)
  );

  try {
    await vectorStore.deleteVectors({
      indexName: RAG_INDEX_NAME,
      ids: idsToDelete,
    });
  } catch (err) {
    console.warn('[Ingest] Failed to delete vectors from vector store, attempting metadata filter delete:', err);
    try {
      await vectorStore.deleteVectors({
        indexName: RAG_INDEX_NAME,
        filter: { source: doc.source },
      });
    } catch (filterErr) {
      console.error('[Ingest] Metadata filter delete also failed:', filterErr);
    }
  }

  const updatedRegistry = registry.filter((d) => d.id !== documentId && d.source !== documentId);
  saveDb(updatedRegistry);
  return true;
}
