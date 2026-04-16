// ── Provider & Model Types ────────────────────────────────────────────────────

export type Provider = "groq" | "together";

export interface ModelConfig {
  provider: Provider;
  model: string;
}

export interface MirrorPathSettings {
  extraction: ModelConfig;
  optimization: ModelConfig;
  evaluation: ModelConfig;
}

// ── Model Manifest ────────────────────────────────────────────────────────────
// Single source of truth for every provider+model pair surfaced in the UI.
// ⚠ Only list Together AI "serverless" / "Turbo" models — dedicated-endpoint
//   models (e.g. Llama-4-Scout) return 400 on the serverless API.

export interface ModelOption {
  label: string;
  provider: Provider;
  model: string;
  badge: string;
}

export const EXTRACTION_MODELS: ModelOption[] = [
  {
    label:    "Groq — Llama 3.1 8B Instant",
    provider: "groq",
    model:    "llama-3.1-8b-instant",
    badge:    "Recommended · Fast · Low quota cost",
  },
  {
    label:    "Together — Llama 3.1 8B Turbo",
    provider: "together",
    model:    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    badge:    "Serverless · Together backup",
  },
  {
    label:    "Groq — Llama 3.3 70B",
    provider: "groq",
    model:    "llama-3.3-70b-versatile",
    badge:    "High quality · Higher quota cost",
  },
];

export const OPTIMIZATION_MODELS: ModelOption[] = [
  {
    label:    "Together — Llama 3.3 70B Turbo",
    provider: "together",
    model:    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    badge:    "Recommended · Serverless · High quality",
  },
  {
    label:    "Together — Llama 3.1 70B Turbo",
    provider: "together",
    model:    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    badge:    "Serverless · Reliable fallback",
  },
  {
    label:    "Groq — Llama 3.3 70B",
    provider: "groq",
    model:    "llama-3.3-70b-versatile",
    badge:    "Groq · Use if Together is slow",
  },
];

// NOTE: Some models require dedicated endpoints and are not available on the
// Together serverless tier. The evaluate route hardcodes Llama-3.3-70B-Instruct-Turbo.
export const EVALUATION_MODELS: ModelOption[] = [
  {
    label:    "Together — Llama 3.3 70B Turbo",
    provider: "together",
    model:    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    badge:    "Recommended · Serverless · High reasoning",
  },
  {
    label:    "Together — Llama 3.1 70B Turbo",
    provider: "together",
    model:    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    badge:    "Serverless · Reliable fallback",
  },
  {
    label:    "Together — Llama 3.1 8B Turbo",
    provider: "together",
    model:    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    badge:    "Serverless · Lightweight",
  },
];

// ── Defaults ──────────────────────────────────────────────────────────────────
// All Together AI models here are serverless/Turbo — no dedicated endpoint needed.
export const DEFAULT_SETTINGS: MirrorPathSettings = {
  extraction:   { provider: "groq",     model: "llama-3.1-8b-instant" },
  optimization: { provider: "together", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  evaluation:   { provider: "together", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
};

// ── localStorage key ──────────────────────────────────────────────────────────
export const LS_SETTINGS_KEY = "mirrorpath_settings";
export const LS_KEYS_KEY     = "mirrorpath_provider_keys";
