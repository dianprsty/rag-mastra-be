import { LibSQLVector } from '@mastra/libsql';

export type VectorProvider = 'libsql' | 'pgvector' | 'pinecone' | 'chroma' | 'qdrant';

export function createVectorStore() {
  const provider = (process.env.VECTOR_PROVIDER || 'libsql').toLowerCase() as VectorProvider;

  switch (provider) {
    case 'libsql':
    default:
      return new LibSQLVector({
        id: 'mastra-rag-vector-store',
        url: process.env.DATABASE_URL || 'file:./mastra-rag.db',
      });
  }
}

export const vectorStore = createVectorStore();
export const RAG_INDEX_NAME = 'documents_index';
