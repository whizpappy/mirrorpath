/**
 * src/lib/llm.ts
 *
 * Unified LLM completion router.
 * Abstracts over Groq (groq-sdk) and Together AI (OpenAI-compatible endpoint).
 * All API routes use this instead of calling provider SDKs directly.
 */

import Groq from "groq-sdk";
import OpenAI from "openai";
import { Provider } from "@/types/settings";

// ── Shared message type (OpenAI-compatible) ───────────────────────────────────
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface CompletionOpts {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  /** When true, requests JSON-mode output from the model */
  json?: boolean;
}

// ── Singleton clients ─────────────────────────────────────────────────────────
// Lazy-initialised so the module can be imported without crashing when keys
// are absent (e.g. during static build analysis).

let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set in environment variables.");
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

let _together: OpenAI | null = null;
function getTogether(): OpenAI {
  if (!_together) {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) throw new Error("TOGETHER_API_KEY is not set in environment variables. Add it to .env.local");
    _together = new OpenAI({
      baseURL: "https://api.together.xyz/v1",
      apiKey,
    });
  }
  return _together;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Route a chat-completion request to the correct provider.
 * @returns The raw content string from the model response.
 * @throws An error with `.status === 429` shape when rate-limited.
 */
export async function generateCompletion(opts: CompletionOpts): Promise<string> {
  const {
    provider,
    model,
    messages,
    temperature = 0.2,
    max_tokens,
    json = false,
  } = opts;

  try {
    if (provider === "groq") {
      const groq = getGroq();
      const res = await groq.chat.completions.create({
        model,
        messages,
        temperature,
        ...(max_tokens ? { max_tokens } : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
      });
      const content = res.choices[0]?.message?.content;
      if (!content) throw new Error("Groq returned an empty response.");
      return content;
    }

    if (provider === "together") {
      const together = getTogether();
      const res = await together.chat.completions.create({
        model,
        messages,
        temperature,
        ...(max_tokens ? { max_tokens } : {}),
        // Together supports json_object mode for most models
        ...(json ? { response_format: { type: "json_object" } } : {}),
      });
      const content = res.choices[0]?.message?.content;
      if (!content) throw new Error("Together AI returned an empty response.");
      return content;
    }

    throw new Error(`Unknown provider: "${provider}"`);
  } catch (err: unknown) {
    // Normalise rate-limit errors from both SDKs so callers can detect them
    // via the same `.status === 429` check already used in API routes.
    if (isRateLimitError(err)) {
      const rateErr = new Error(`Rate limit reached on provider "${provider}".`) as Error & { status: number };
      rateErr.status = 429;
      throw rateErr;
    }
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string; error?: { status?: number } };
  if (e.status === 429) return true;
  if (e.error?.status === 429) return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("rate_limit");
}

/** Strip markdown code fences that models occasionally emit despite json_object mode */
export function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
