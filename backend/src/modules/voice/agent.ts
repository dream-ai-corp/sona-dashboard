import { settingsService } from '../settings/settings.service';
import { AppError } from '../../core/middleware/error-handler.middleware';
import { config } from '../../config';
import { tools, findTool } from './tool-catalog';
import { toolToOpenAI } from './zod-to-tool';

/**
 * Voice agent — OpenAI-compatible tool-calling loop with a provider chain.
 *
 * Provider resolution (same order as Sona's config.ts):
 *   1. LM Studio (local LLM at user-configured or env-default baseUrl) —
 *      preferred, tool-capable, zero API cost.
 *   2. OpenRouter — fallback when LM Studio is unreachable or errors out.
 *
 * Per turn:
 *   - Build messages = [system, ...history, userTurn]
 *   - Try each configured provider in order until one succeeds.
 *   - Run up to MAX_TOOL_ROUNDS tool rounds inside the winning provider.
 *   - Return the final assistant text + full tool-call trace.
 *
 * Session memory is a per-process Map keyed by (userId, sessionId) with a
 * rolling 40-turn window. Swap for a Prisma-backed table when durability
 * matters.
 */

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_TURNS = 40;
const PROVIDER_CONNECT_TIMEOUT_MS = 5_000;
const PROVIDER_TOTAL_TIMEOUT_MS = 120_000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AgentToolCallTrace {
  name: string;
  args: unknown;
  result: unknown;
  error?: string;
}

export interface AgentReply {
  reply: string;
  toolCalls: AgentToolCallTrace[];
  rounds: number;
  provider: string;
  model: string;
}

interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

const sessions = new Map<string, ChatMessage[]>();

function sessionKey(userId: string, sessionId: string | undefined): string {
  return `${userId}::${sessionId ?? 'default'}`;
}

function loadHistory(userId: string, sessionId: string | undefined): ChatMessage[] {
  return sessions.get(sessionKey(userId, sessionId)) ?? [];
}

function saveHistory(userId: string, sessionId: string | undefined, msgs: ChatMessage[]): void {
  // Drop system message from what we store — it's rebuilt each turn.
  const persist = msgs.filter((m) => m.role !== 'system').slice(-MAX_HISTORY_TURNS);
  sessions.set(sessionKey(userId, sessionId), persist);
}

export function clearSession(userId: string, sessionId: string | undefined): void {
  sessions.delete(sessionKey(userId, sessionId));
}

// ==================== Provider resolution ====================

async function resolveProviders(userId: string): Promise<Provider[]> {
  const s = await settingsService.getRaw(userId);
  const chain: Provider[] = [];

  // 1. LM Studio (local). User settings override env defaults.
  const lmBase = s.lmstudioBaseUrl || config.lmstudio.baseUrl;
  const lmKey = s.lmstudioApiKey || config.lmstudio.apiKey;
  const lmModel = s.lmstudioModel || config.lmstudio.model;
  if (lmBase && lmModel) {
    chain.push({ name: 'lmstudio', baseUrl: lmBase, apiKey: lmKey, model: lmModel });
  }

  // 2. OpenRouter (remote fallback). Only included if a key is set somewhere.
  const orKey = s.openrouterApiKey || config.openRouter.apiKey;
  const orModel = s.openrouterModel || config.openRouter.model;
  if (orKey) {
    chain.push({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: orKey,
      model: orModel,
    });
  }

  return chain;
}

// ==================== Low-level HTTP ====================

interface OpenAIChoice {
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string;
}

interface OpenAIResponse {
  choices?: OpenAIChoice[];
  error?: { message: string };
}

async function callModel(
  provider: Provider,
  messages: ChatMessage[],
): Promise<OpenAIChoice> {
  const openaiTools = tools.map(toolToOpenAI);
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const ctrl = new AbortController();
  const connectTimer = setTimeout(() => ctrl.abort(), PROVIDER_CONNECT_TIMEOUT_MS);
  const totalTimer = setTimeout(() => ctrl.abort(), PROVIDER_TOTAL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        tools: openaiTools,
        tool_choice: 'auto',
        max_tokens: 1024,
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    });
    // Connected — cancel the short connect timer, keep the long total timer.
    clearTimeout(connectTimer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AppError(
        502,
        `${provider.name.toUpperCase()}_ERROR`,
        `${provider.name} ${res.status}: ${body.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as OpenAIResponse;
    if (data.error) {
      throw new AppError(502, `${provider.name.toUpperCase()}_ERROR`, data.error.message);
    }
    const choice = data.choices?.[0];
    if (!choice) {
      throw new AppError(502, `${provider.name.toUpperCase()}_ERROR`, 'No choices in response');
    }
    return choice;
  } catch (e) {
    if (e instanceof AppError) throw e;
    // Network/timeout errors bubble up with a normalized shape so the
    // provider chain can catch and fall through.
    const msg = e instanceof Error ? e.message : String(e);
    throw new AppError(
      502,
      `${provider.name.toUpperCase()}_UNREACHABLE`,
      `${provider.name} unreachable: ${msg}`,
    );
  } finally {
    clearTimeout(connectTimer);
    clearTimeout(totalTimer);
  }
}

// ==================== System prompt ====================

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    'You are the voice assistant for a Personal Life Management app (PLM).',
    `Today is ${today}. The user manages finances, a meal-planning system, a shopping list, and a calendar.`,
    '',
    '# Rules',
    '- Be extremely concise. Default to 1-2 short sentences. No preamble, no emoji, no apologies, no "I\'d be happy to", no closing pleasantries.',
    '- You have tools — use them. Never claim you cannot do something a tool covers; just call it.',
    '- ALWAYS call list tools (finance_list_categories, shopping_list_recipes, etc.) BEFORE creating new entities — the user may already have one, and IDs must come from real data, never guesses.',
    '- Amounts in finance_create_transaction are signed: negative for expenses, positive for income.',
    '- When the user references "that expense", "the recipe I just added", "this week\'s menu", etc., look for the relevant id in your own recent tool results above — do not ask for clarification unless truly ambiguous.',
    '- If the user asks a question (not a command), answer with the data you have; only call a read tool if you actually need fresh data.',
    '- After completing a mutation, reply with a single short confirmation sentence describing what changed — no filler.',
    '- Reply in the same language the user spoke in (French or English).',
  ].join('\n');
}

// ==================== Tool execution ====================

async function executeTool(
  userId: string,
  name: string,
  rawArgs: string,
): Promise<{ result: unknown; error?: string }> {
  const tool = findTool(name);
  if (!tool) return { result: null, error: `unknown tool: ${name}` };

  let args: unknown;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch (e) {
    return { result: null, error: `invalid JSON arguments: ${(e as Error).message}` };
  }

  try {
    const parsed = tool.schema.parse(args);
    const result = await tool.handler(userId, parsed);
    return { result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: null, error: msg };
  }
}

// ==================== Agent loop (one provider) ====================

async function runWithProvider(
  userId: string,
  provider: Provider,
  messages: ChatMessage[],
  trace: AgentToolCallTrace[],
): Promise<{ reply: string; rounds: number }> {
  let finalReply = '';
  let round = 0;

  for (round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const choice = await callModel(provider, messages);
    const assistantMsg = choice.message;
    const toolCalls = assistantMsg.tool_calls ?? [];

    if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
      finalReply = assistantMsg.content ?? '';
      messages.push({ role: 'assistant', content: finalReply });
      break;
    }

    messages.push({
      role: 'assistant',
      content: assistantMsg.content ?? '',
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const { result, error } = await executeTool(userId, tc.function.name, tc.function.arguments);
      trace.push({
        name: tc.function.name,
        args: safeParse(tc.function.arguments),
        result,
        error,
      });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(error ? { error } : result ?? {}, replacer).slice(0, 8000),
      });
    }
  }

  return { reply: finalReply, rounds: round };
}

// ==================== Public entry point ====================

export async function runAgent(
  userId: string,
  userMessage: string,
  sessionId?: string,
): Promise<AgentReply> {
  const providers = await resolveProviders(userId);
  if (providers.length === 0) {
    throw new AppError(
      400,
      'NO_LLM_PROVIDER',
      'No LLM provider configured. In Settings, set either LM Studio (Local LLM) base URL + model, '
      + 'or an OpenRouter API key.',
    );
  }

  const history = loadHistory(userId, sessionId);
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const errors: string[] = [];
  for (const provider of providers) {
    // Use a fresh copy of messages per provider so a failed provider doesn't
    // leave half-written tool turns in the history we'll persist.
    const messages: ChatMessage[] = baseMessages.map((m) => ({ ...m }));
    const trace: AgentToolCallTrace[] = [];

    try {
      const { reply, rounds } = await runWithProvider(userId, provider, messages, trace);
      saveHistory(userId, sessionId, messages);
      console.log(`[voice] ${provider.name} ok (${rounds} rounds, ${trace.length} tool calls)`);
      return { reply, toolCalls: trace, rounds, provider: provider.name, model: provider.model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[voice] ${provider.name} failed: ${msg}`);
      errors.push(`${provider.name}: ${msg}`);
      // Fall through to the next provider.
    }
  }

  throw new AppError(
    502,
    'ALL_PROVIDERS_FAILED',
    `All LLM providers failed.\n${errors.join('\n')}`,
  );
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

function replacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && 'toString' in value && value.constructor?.name === 'Decimal') {
    return Number((value as { toString: () => string }).toString());
  }
  return value;
}
