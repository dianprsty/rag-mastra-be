import { Mastra } from '@mastra/core/mastra';
import { ragAgent } from './agents/rag-agent.js';
import { searchKnowledgeBaseTool } from './tools/search-kb.js';
import { indexDocWorkflow } from './workflows/index-doc.js';

export const mastra = new Mastra({
  agents: { ragAgent },
  tools: { searchKnowledgeBaseTool },
  workflows: { indexDocWorkflow },
});
