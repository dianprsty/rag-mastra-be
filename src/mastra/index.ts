import { Mastra } from '@mastra/core/mastra';
import { ragAgent } from './agents/rag-agent.js';
import { searchKnowledgeBaseTool } from './tools/search-kb.js';
import { indexDocWorkflow } from './workflows/index-doc.js';

export const mastra = new Mastra({
  server: {
    port: 4111,
  },
  agents: { ragAgent },
  tools: { searchKnowledgeBaseTool },
  workflows: { indexDocWorkflow },
});
