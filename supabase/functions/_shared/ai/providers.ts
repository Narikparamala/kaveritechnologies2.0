// Provider abstraction for the BYO AI generation functions.
//
// Raw `fetch` per provider (allowed by the task; keeps the edge runtime lean).
// Providers: google | openai | anthropic | groq | openrouter | custom (OpenAI-
// compatible). Every provider exposes one uniform interface:
//
//   chat({ provider, apiKey, baseUrl, model, system, user, tools?, jsonMode? })
//     -> { text, toolCalls? }
//
// Tool-calling (Kaveri MCP tools) is wired for providers we can drive in a
// simple loop: OpenAI-compatible (openai/groq/openrouter/custom) and Google.
// Anthropic uses schema-bearing tool blocks with the same loop structure.
//
// Never log apiKey. Error mapping lives in errors.ts (mapProviderError).

import { mapProviderError, safeDetail } from './errors.ts';

export type ProviderId = 'google' | 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'custom';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface ToolCallRequest {
  id: string;
  name: string;
  argsJson: string;
}

export interface ChatArgs {
  provider: ProviderId;
  apiKey: string;
  baseUrl?: string | null;
  model: string;
  system: string;
  user: string;
  jsonMode?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  /** MCP tools exposed for this request (name/description/JSON schema). */
  tools?: McpToolDef[];
  /** Executes a tool call and returns its JSON-string result. */
  runTool?: (call: ToolCallRequest) => Promise<string>;
  maxToolRounds?: number;
}

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  google: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: 'https://api.openai.com/v1', // override with the saved base_url
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  custom: 'Custom (OpenAI-compatible)',
};

export const SUGGESTED_MODELS: Record<ProviderId, string[]> = {
  google: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-sonnet-4-5'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  // Prefer OpenRouter in the UI as the default suggestion (per the task).
  openrouter: ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001', 'anthropic/claude-3.5-haiku'],
  custom: [],
};

export interface ChatOutcome {
  text: string;
  toolRounds: number;
}

async function throwMapped(res: Response, provider: string): Promise<never> {
  const detail = safeDetail(await res.text().catch(() => ''));
  const err = new Error(mapProviderError({ status: res.status, provider, detail })) as Error & {
    providerStatus?: number;
  };
  err.providerStatus = res.status;
  throw err;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible family: openai, groq, openrouter, custom
// ---------------------------------------------------------------------------
async function chatOpenAiCompatible(args: ChatArgs): Promise<ChatOutcome> {
  const base = (args.baseUrl?.trim() || DEFAULT_BASE_URLS[args.provider]).replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${args.apiKey}`,
  };
  if (args.provider === 'openrouter') {
    headers['X-Title'] = 'Kaveri Academy Content Studio';
  }

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: args.system },
    { role: 'user', content: args.user },
  ];

  const apiTools = (args.tools ?? []).map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  let rounds = 0;
  const maxRounds = args.runTool ? (args.maxToolRounds ?? 4) : 0;

  for (;;) {
    const body: Record<string, unknown> = {
      model: args.model,
      messages,
      temperature: args.temperature ?? 0.6,
      max_tokens: args.maxOutputTokens ?? 8192,
    };
    if (args.jsonMode && rounds === 0) body.response_format = { type: 'json_object' };
    if (apiTools.length > 0 && args.runTool) body.tools = apiTools;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) await throwMapped(res, args.provider);
    const data = await res.json();

    const choice = data?.choices?.[0];
    const message = choice?.message ?? {};
    const toolCalls: any[] = message.tool_calls ?? [];

    if (toolCalls.length > 0 && args.runTool && rounds < maxRounds) {
      rounds += 1;
      messages.push(message); // assistant message containing tool_calls
      for (const call of toolCalls) {
        const result = await args.runTool({
          id: call.id ?? `call_${rounds}_${messages.length}`,
          name: call.function?.name ?? '',
          argsJson: call.function?.arguments ?? '{}',
        });
        messages.push({ role: 'tool', tool_call_id: call.id ?? null, content: result });
      }
      continue;
    }

    const text = String(message.content ?? '');
    if (!text.trim() && toolCalls.length === 0) {
      throw new Error('The model returned an empty response. Try again or switch models.');
    }
    return { text, toolRounds: rounds };
  }
}

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------
async function chatGoogle(args: ChatArgs): Promise<ChatOutcome> {
  const base = (args.baseUrl?.trim() || DEFAULT_BASE_URLS.google).replace(/\/$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(args.model)}:generateContent`;

  const functionDeclarations = (args.tools ?? []).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));

  const contents: Array<Record<string, unknown>> = [{ role: 'user', parts: [{ text: args.user }] }];
  let rounds = 0;
  const maxRounds = args.runTool ? (args.maxToolRounds ?? 4) : 0;

  for (;;) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: args.system }] },
      contents,
      generationConfig: {
        temperature: args.temperature ?? 0.6,
        maxOutputTokens: args.maxOutputTokens ?? 8192,
        ...(args.jsonMode && rounds === 0 ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (functionDeclarations.length > 0 && args.runTool) body.tools = [{ functionDeclarations }];

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-goog-api-key': args.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) await throwMapped(res, args.provider);
    const data = await res.json();

    const candidate = data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts ?? [];
    const fnCalls: any[] = parts.filter(p => p.functionCall).map(p => p.functionCall);

    if (fnCalls.length > 0 && args.runTool && rounds < maxRounds) {
      rounds += 1;
      contents.push({ role: 'model', parts });
      const toolParts: any[] = [];
      for (const call of fnCalls) {
        const result = await args.runTool({ id: call.name, name: call.name, argsJson: JSON.stringify(call.args ?? {}) });
        toolParts.push({
          functionResponse: { name: call.name, response: safeJsonParse(result) },
        });
      }
      contents.push({ role: 'user', parts: toolParts });
      continue;
    }

    const text = parts.map(p => p.text ?? '').join('');
    if (!text.trim()) throw new Error('The model returned an empty response. Try again or switch models.');
    return { text, toolRounds: rounds };
  }
}

// ---------------------------------------------------------------------------
// Anthropic Claude
// ---------------------------------------------------------------------------
async function chatAnthropic(args: ChatArgs): Promise<ChatOutcome> {
  const base = (args.baseUrl?.trim() || DEFAULT_BASE_URLS.anthropic).replace(/\/$/, '');
  const url = `${base}/messages`;

  const apiTools = (args.tools ?? []).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  const messages: Array<Record<string, unknown>> = [{ role: 'user', content: args.user }];
  let rounds = 0;
  const maxRounds = args.runTool ? (args.maxToolRounds ?? 4) : 0;

  for (;;) {
    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: args.maxOutputTokens ?? 8192,
      temperature: args.temperature ?? 0.6,
      system: args.system,
      messages,
    };
    if (apiTools.length > 0 && args.runTool) body.tools = apiTools;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': args.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) await throwMapped(res, args.provider);
    const data = await res.json();

    const blocks: any[] = data?.content ?? [];
    const toolUses: any[] = blocks.filter(b => b.type === 'tool_use');
    const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');

    if (toolUses.length > 0 && args.runTool && rounds < maxRounds) {
      rounds += 1;
      messages.push({ role: 'assistant', content: blocks });
      const toolResults: any[] = [];
      for (const call of toolUses) {
        const result = await args.runTool({ id: call.id, name: call.name, argsJson: JSON.stringify(call.input ?? {}) });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: result.slice(0, 4000) });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    if (!text.trim()) throw new Error('The model returned an empty response. Try again or switch models.');
    return { text, toolRounds: rounds };
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { result: raw.slice(0, 2000) };
  }
}

export async function chat(args: ChatArgs): Promise<ChatOutcome> {
  switch (args.provider) {
    case 'google':
      return chatGoogle(args);
    case 'anthropic':
      return chatAnthropic(args);
    case 'openai':
    case 'groq':
    case 'openrouter':
    case 'custom':
      return chatOpenAiCompatible(args);
    default: {
      const never: never = args.provider;
      throw new Error(`Unknown provider: ${String(never)}`);
    }
  }
}

/** Quick-connection probe: smallest possible completion on the chosen model. */
export async function probeConnection(args: Pick<ChatArgs, 'provider' | 'apiKey' | 'baseUrl' | 'model'>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await chat({
      ...args,
      system: 'You are a connection test. Reply with the single word: OK',
      user: 'Reply OK',
      maxOutputTokens: 16,
      temperature: 0,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Connection failed.' };
  }
}
