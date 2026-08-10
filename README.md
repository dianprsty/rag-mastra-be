# 🚀 Mastra RAG Backend (`rag-backend`)

A production-ready, modular **Retrieval-Augmented Generation (RAG)** backend powered by **Mastra AI**, Express.js, and TypeScript. 

It provides dynamic live model discovery, persistent thread history management, pluggable vector database adapters (LibSQL, PgVector, Pinecone, Qdrant), PDF and document ingestion workflows, grounded RAG agent streaming, and Mastra Studio dev tools.

---

## 📋 Prerequisites

Before running the backend, make sure you have:
* **Node.js**: `v22.x+` (**Minimum required: Node 22.0.0+**)
* **npm**: `v10.x+`

* **API Key**: 
  * [OpenRouter API Key](https://openrouter.ai/keys) (Recommended for dynamic model access to 200+ LLMs)
  * OR OpenAI API Key

---

## 🏗️ Architecture & Features

```mermaid
graph TD
    Client[Next.js Frontend / HTTP Client] -->|GET /api/models| ModelDisc[Live Model Discovery Engine]
    Client -->|POST /api/ingest| Ingest[MDocument Chunking & Embeddings]
    Client -->|POST /api/chat - SSE Stream| Agent[Grounded RAG Agent]
    Client -->|GET /api/chat/threads| ThreadStore[Persistent SQLite/JSON Thread Store]
    
    ModelDisc -->|Fetch Live Models| OpenRouter[OpenRouter / OpenAI APIs]
    Ingest --> VectorFactory[Vector Store Factory Adapter]
    Agent -->|Query Context| VectorFactory
    
    VectorFactory -->|VECTOR_PROVIDER=libsql| LibSQL[(LibSQL / SQLite)]
    VectorFactory -->|VECTOR_PROVIDER=pgvector| PgVector[(PgVector / PostgreSQL)]
    VectorFactory -->|VECTOR_PROVIDER=pinecone| Pinecone[(Pinecone Cloud)]
```

* **Live Dynamic Model Discovery**: Fetches real-time LLM chat and embedding models from provider APIs with 1-hour in-memory caching and fallback support.
* **Persistent Thread History Store**: Automatically saves conversation threads, message logs, and citations in `.mastra/chat_history.json` with automatic thread title generation.
* **Pluggable Vector Databases**: Zero-code-change switching between LibSQL (SQLite), PgVector, Pinecone, Chroma, and Qdrant via a single `.env` setting.
* **Document Processing (`@mastra/rag`)**: Ingests raw text, markdown, or binary PDF documents (`pdf-parse`) using `MDocument` with recursive 512-token chunking and 1536d vector embeddings.
* **Grounded RAG Agent**: `ragAgent` queries the vector database and cites all factual claims with inline bracketed markers (`[1]`, `[2]`).
* **Streaming API (SSE) + AbortSignal**: Server-Sent Events stream responses chunk-by-chunk with client abort cancellation support.
* **Mastra Studio**: Embedded local dev UI on `http://localhost:4111`.

---

## ⚙️ Environment Variables

Create a `.env` file in the root of `rag-backend`:

```env
PORT=4000
VECTOR_PROVIDER=libsql # Options: libsql, pgvector, pinecone, chroma, qdrant
DATABASE_URL=file:./mastra-rag.db
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

---

## 📦 Installation & Setup

1. **Navigate to the backend directory**:
   ```bash
   cd rag-backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the Express API Server**:
   ```bash
   npm run dev
   ```
   The backend API will run at **`http://localhost:4000`**.

4. **(Optional) Launch Mastra Studio**:
   ```bash
   npm run studio
   ```
   Mastra Studio will launch on **`http://localhost:4111`** where you can interactively test agents, tools, and workflows.

5. **Build for Production**:
   ```bash
   npm run build
   ```

---

## 📡 API Endpoints Reference

### 1. Chat Threads Management
* **`GET /api/chat/threads`**: List all chat threads sorted by update time.
* **`GET /api/chat/threads/:threadId`**: Fetch messages and metadata for a thread.
* **`POST /api/chat/threads`**: Create a new thread (`{ "title": "New Chat" }`).
* **`DELETE /api/chat/threads/:threadId`**: Delete a chat thread and its message logs.

### 2. `GET /api/models`
Fetches live chat and embedding models from OpenRouter / OpenAI.
* **Response**:
  ```json
  {
    "chatModels": [
      { "id": "openrouter/inclusionai/ling-3.0-flash:free", "name": "Ling 3.0 Flash (Free)", "provider": "OpenRouter", "isFree": true },
      { "id": "openrouter/openai/gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI" }
    ],
    "embeddingModels": [
      { "id": "openrouter/text-embedding-3-small", "name": "Text Embedding 3 Small (1536d)", "provider": "OpenAI" }
    ]
  }
  ```

### 3. `POST /api/ingest`
Ingests raw text, markdown, or binary PDF files (`pdfBase64`) into the vector database.
* **Request Body**:
  ```json
  {
    "text": "Mastra AI is an agentic framework for building AI applications.",
    "source": "mastra-overview.md",
    "title": "Mastra AI Overview",
    "format": "markdown",
    "embeddingModel": "openrouter/text-embedding-3-small"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "documentId": "mastra-overview.md",
    "title": "Mastra AI Overview",
    "chunksIngested": 4,
    "embeddingModel": "openrouter/text-embedding-3-small"
  }
  ```

### 4. `POST /api/chat` (SSE Streaming)
Streams RAG agent responses using Server-Sent Events and automatically persists user prompts and assistant outputs to `threadId`.
* **Request Body**:
  ```json
  {
    "messages": [
      { "role": "user", "content": "What is Mastra AI?" }
    ],
    "chatModel": "openrouter/openai/gpt-4o-mini",
    "threadId": "thread-17089123"
  }
  ```
* **Response**: `text/event-stream` chunks (`data: {"content": "..."}`)

### 5. `GET /api/documents/list`
Returns all ingested documents with metadata (chunk count, size, timestamp, format).

### 6. `GET /api/documents`
Returns active vector index status and adapter info.

---

## 🔄 How to Switch Vector Databases (Zero Code Changes)

Change `VECTOR_PROVIDER` in your `.env` file:

* **LibSQL / SQLite (Default)**:
  ```env
  VECTOR_PROVIDER=libsql
  DATABASE_URL=file:./mastra-rag.db
  ```
* **PostgreSQL + PgVector**:
  ```env
  VECTOR_PROVIDER=pgvector
  POSTGRES_URL=postgresql://user:password@localhost:5432/my_rag_db
  ```
* **Pinecone Cloud**:
  ```env
  VECTOR_PROVIDER=pinecone
  PINECONE_API_KEY=your_pinecone_key
  ```

---

## 📁 Project Structure

```
rag-backend/
├── src/
│   ├── mastra/
│   │   ├── agents/
│   │   │   └── rag-agent.ts        # Grounded RAG AI Agent definition
│   │   ├── memory/
│   │   │   └── thread-store.ts     # Persistent chat thread database manager
│   │   ├── rag/
│   │   │   ├── ingest.ts           # MDocument chunking & vector indexing
│   │   │   └── model-discovery.ts  # Live OpenRouter/OpenAI LLM discovery
│   │   ├── tools/
│   │   │   └── search-kb.ts        # Vector similarity search tool
│   │   ├── config.ts               # RAG constants & default settings
│   │   ├── index.ts                # Mastra instance registration
│   │   └── vector-store-factory.ts # Pluggable vector store factory adapter
│   ├── routes/
│   │   └── ragRouter.ts            # Express REST API routes & SSE stream
│   └── index.ts                    # Main Express server entrypoint
├── .env
├── package.json
└── tsconfig.json
```
