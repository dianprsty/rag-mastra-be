import fs from 'node:fs';
import path from 'node:path';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageItem[];
}

const DB_DIR = path.resolve(process.cwd(), '.mastra');
const DB_FILE = path.join(DB_DIR, 'chat_history.json');

function ensureDbFile(): ChatThread[] {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const defaultSeed: ChatThread[] = [
      {
        id: 'thread-welcome',
        title: 'Welcome Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'msg-welcome',
            role: 'assistant',
            content:
              "Hello! I am your **Knowledge Assistant**. Ask me questions grounded in your uploaded documents!\n\nI will cite my sources using clickable tags like `[1]` so you can easily view and verify facts.",
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ];
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultSeed, null, 2), 'utf-8');
    return defaultSeed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as ChatThread[];
  } catch {
    return [];
  }
}

function saveDb(threads: ChatThread[]) {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(threads, null, 2), 'utf-8');
}

export function listThreads() {
  const threads = ensureDbFile();
  return threads
    .map(({ id, title, createdAt, updatedAt, messages }) => ({
      id,
      title,
      createdAt,
      updatedAt,
      messageCount: messages.length,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getThread(threadId: string): ChatThread | null {
  const threads = ensureDbFile();
  return threads.find((t) => t.id === threadId) || null;
}

export function createThread(title: string = 'New Conversation'): ChatThread {
  const threads = ensureDbFile();
  const newThread: ChatThread = {
    id: `thread-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  threads.unshift(newThread);
  saveDb(threads);
  return newThread;
}

export function saveMessageToThread(
  threadId: string,
  role: 'user' | 'assistant',
  content: string
): ChatThread {
  const threads = ensureDbFile();
  let thread = threads.find((t) => t.id === threadId);

  if (!thread) {
    thread = {
      id: threadId,
      title: role === 'user' ? (content.length > 35 ? content.slice(0, 35) + '...' : content) : 'New Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    threads.unshift(thread);
  }

  const newMsg: ChatMessageItem = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  thread.messages.push(newMsg);
  thread.updatedAt = new Date().toISOString();

  // Auto title thread from first user message if title is default
  if (role === 'user' && (thread.title === 'New Conversation' || thread.title === 'Welcome Conversation')) {
    thread.title = content.length > 35 ? content.slice(0, 35) + '...' : content;
  }

  saveDb(threads);
  return thread;
}

export function deleteThread(threadId: string): boolean {
  let threads = ensureDbFile();
  const initialLength = threads.length;
  threads = threads.filter((t) => t.id !== threadId);
  saveDb(threads);
  return threads.length < initialLength;
}
