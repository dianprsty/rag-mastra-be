import { Router, Request, Response } from 'express';
import { getLiveModels } from '../mastra/rag/model-discovery.js';
import { ingestDocument, getIngestedDocumentsList } from '../mastra/rag/ingest.js';
import { ragAgent } from '../mastra/agents/rag-agent.js';
import { vectorStore, RAG_INDEX_NAME } from '../mastra/vector-store-factory.js';
import {
  listThreads,
  getThread,
  createThread,
  saveMessageToThread,
  deleteThread,
} from '../mastra/memory/thread-store.js';


export function createRAGRouter(): Router {
  const router = Router();

  // 1. Thread Management Endpoints
  router.get('/chat/threads', (req: Request, res: Response) => {
    try {
      const threads = listThreads();
      res.json({ threads });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list threads' });
    }
  });

  router.get('/chat/threads/:threadId', (req: Request, res: Response) => {
    try {
      const threadId = String(req.params.threadId);
      const thread = getThread(threadId);
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      res.json(thread);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch thread' });
    }
  });

  router.post('/chat/threads', (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const thread = createThread(title);
      res.json(thread);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create thread' });
    }
  });

  router.delete('/chat/threads/:threadId', (req: Request, res: Response) => {
    try {
      const threadId = String(req.params.threadId);
      const success = deleteThread(threadId);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete thread' });
    }
  });


  // 2. Get Live Dynamic Models (Option 2)
  router.get('/models', async (req: Request, res: Response) => {
    try {
      const models = await getLiveModels();
      res.json(models);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch models' });
    }
  });

  // 3. Ingest Document
  router.post('/ingest', async (req: Request, res: Response) => {
    try {
      const { text, source, title, format, embeddingModel, pdfBase64 } = req.body;

      if (!text && !pdfBase64) {
        res.status(400).json({ error: 'Either "text" or "pdfBase64" is required.' });
        return;
      }

      const result = await ingestDocument({
        text: text || '',
        source: source || title || 'document.pdf',
        title: title || source || 'Document',
        format: format || 'text',
        embeddingModel,
        pdfBase64,
      });

      res.json(result);
    } catch (error: any) {
      console.error('[Router] Ingest error:', error);
      res.status(500).json({ error: error.message || 'Ingestion failed' });
    }
  });

  // 4. RAG Chat Stream (SSE) + Thread Persistence
  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { messages, chatModel, threadId } = req.body;

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: '"messages" array is required.' });
        return;
      }

      // Save latest user message to thread
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
      const targetThreadId = threadId || 'thread-welcome';

      if (lastUserMsg && lastUserMsg.content) {
        saveMessageToThread(targetThreadId, 'user', lastUserMsg.content);
      }

      // Configure SSE Headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const modelOverride = chatModel && typeof chatModel === 'string' ? chatModel : undefined;

      const responseStream = await ragAgent.stream(messages, {
        model: modelOverride,
      });

      let fullAssistantText = '';

      // Stream text chunks to client via SSE
      for await (const chunk of responseStream.textStream) {
        fullAssistantText += chunk;
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      // Save full assistant response to thread
      if (fullAssistantText) {
        saveMessageToThread(targetThreadId, 'assistant', fullAssistantText);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('[Router] Chat stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Chat stream failed' });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });


  // 4. List Vector Indexes & Status
  router.get('/documents', async (req: Request, res: Response) => {
    try {
      const indexes = await vectorStore.listIndexes();
      res.json({
        indexes,
        activeIndex: RAG_INDEX_NAME,
        provider: process.env.VECTOR_PROVIDER || 'libsql',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list vector documents' });
    }
  });

  // 5. Get Detailed Ingested Documents List
  router.get('/documents/list', async (req: Request, res: Response) => {
    try {
      const docs = getIngestedDocumentsList();
      res.json({ documents: docs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch ingested documents list' });
    }
  });


  return router;
}
