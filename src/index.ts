import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createRAGRouter } from './routes/ragRouter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Mount RAG API Router
app.use('/api', createRAGRouter());

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mastra-rag-backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Mastra RAG Backend running on http://localhost:${PORT}`);
  console.log(`📡 Endpoints available:`);
  console.log(`   - GET  http://localhost:${PORT}/api/models (Option 2 Live Models)`);
  console.log(`   - POST http://localhost:${PORT}/api/ingest`);
  console.log(`   - POST http://localhost:${PORT}/api/chat (SSE Stream)`);
  console.log(`   - GET  http://localhost:${PORT}/api/documents`);
});
