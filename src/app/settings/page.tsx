"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Select,
  SelectItem,
  Button,
  Divider,
  Callout,
  Badge,
} from "@tremor/react";
import { ArrowLeft, Save, Cpu, Info } from "lucide-react";
import {
  MirrorPathSettings,
  DEFAULT_SETTINGS,
  LS_SETTINGS_KEY,
  EXTRACTION_MODELS,
  OPTIMIZATION_MODELS,
  EVALUATION_MODELS,
  ModelOption,
  Provider,
} from "@/types/settings";

// ── helpers ───────────────────────────────────────────────────────────────────
function loadSettings(): MirrorPathSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function modelKey(provider: Provider, model: string) {
  return `${provider}::${model}`;
}

function fromKey(key: string): { provider: Provider; model: string } {
  const [provider, ...rest] = key.split("::");
  return { provider: provider as Provider, model: rest.join("::") };
}

// ── Model row ─────────────────────────────────────────────────────────────────
function ModelRow({
  step,
  label,
  description,
  options,
  value,
  onChange,
}: {
  step: string;
  label: string;
  description: string;
  options: ModelOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = options.find((o) => modelKey(o.provider, o.model) === value);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-4 py-5 border-b border-tremor-border last:border-0">
      {/* Left label block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono font-bold text-indigo-500 uppercase tracking-widest">
            {step}
          </span>
          <span className="text-xs font-mono font-bold text-tremor-content-strong">
            {label}
          </span>
        </div>
        <p className="text-[11px] font-mono text-tremor-content leading-snug">{description}</p>
        {selected && (
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
              selected.provider === "groq"
                ? "bg-violet-100 text-violet-700"
                : "bg-blue-100 text-blue-700"
            }`}>
              {selected.provider}
            </span>
            <span className="text-[10px] font-mono text-tremor-content">{selected.badge}</span>
          </div>
        )}
      </div>

      {/* Right dropdown */}
      <div className="w-full sm:w-72 shrink-0">
        <Select value={value} onValueChange={onChange} className="font-mono text-xs">
          {options.map((opt) => (
            <SelectItem
              key={modelKey(opt.provider, opt.model)}
              value={modelKey(opt.provider, opt.model)}
              className="font-mono text-xs"
            >
              {opt.label}
            </SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [settings, setSettings]       = useState<MirrorPathSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved]             = useState(false);
  const [mounted, setMounted]         = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleSave = () => {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const setExtraction   = (k: string) => setSettings((s) => ({ ...s, extraction:   fromKey(k) }));
  const setOptimization = (k: string) => setSettings((s) => ({ ...s, optimization: fromKey(k) }));
  const setEvaluation   = (k: string) => setSettings((s) => ({ ...s, evaluation:   fromKey(k) }));

  return (
    <div className="min-h-screen bg-tremor-background-muted font-mono">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* ── Header ── */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-tremor-content hover:text-tremor-content-strong transition-colors mb-6"
        >
          <ArrowLeft size={13} />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight uppercase text-stone-950">
            Settings
          </h1>
          <p className="text-xs font-mono text-tremor-content mt-1">
            Pipeline model tiers are server-enforced. The selectors below show the
            active tier for each stage — API keys live in <code className="bg-stone-100 px-1 rounded">.env.local</code>.
          </p>
        </div>

        {/* ── Info callout ── */}
        <Callout
          title="Model Usage Guide"
          color="blue"
          icon={Info}
          className="mb-6 font-mono text-xs"
        >
          <span className="font-mono text-xs">
            LLM settings are configured server-side via{" "}
            <code className="bg-blue-50 px-1 rounded">.env.local</code>. Add{" "}
            <code className="bg-blue-50 px-1 rounded">GROQ_API_KEY</code> and{" "}
            <code className="bg-blue-50 px-1 rounded">TOGETHER_API_KEY</code> then restart
            the dev server. Keys are never exposed to the browser.
          </span>
        </Callout>

        <TabGroup>
          <TabList className="mb-6">
            <Tab className="font-mono text-xs flex items-center gap-1.5">
              <Cpu size={12} /> Model Selection
            </Tab>
            <Tab className="font-mono text-xs flex items-center gap-1.5">
              <Info size={12} /> Usage Guide
            </Tab>
          </TabList>

          <TabPanels>

            {/* ── Tab 1: Model Selection ────────────────────────────────────── */}
            <TabPanel>
              <Card className="p-6 border border-tremor-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu size={14} className="text-indigo-500" />
                    <span className="text-xs font-mono font-bold uppercase tracking-widest text-stone-950">
                      Preferred Models
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color="violet" className="font-mono text-[9px]">Groq</Badge>
                    <Badge color="blue" className="font-mono text-[9px]">Together</Badge>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-tremor-content mb-4">
                  Active tier per pipeline stage. Extraction uses Groq (free, instant). Optimisation and Evaluation use Together AI serverless Turbo models.
                </p>

                <ModelRow
                  step="01"
                  label="Extraction"
                  description="Parses the uploaded PDF or DOCX file into structured JSON via the AI. Uses a small, fast model to minimise rate-limit cost."
                  options={EXTRACTION_MODELS}
                  value={modelKey(settings.extraction.provider, settings.extraction.model)}
                  onChange={setExtraction}
                />
                <ModelRow
                  step="02"
                  label="Optimisation"
                  description="Mirrors the Job Description into resume bullets using Action + Task + Metric format with domain vocabulary injection."
                  options={OPTIMIZATION_MODELS}
                  value={modelKey(settings.optimization.provider, settings.optimization.model)}
                  onChange={setOptimization}
                />
                <ModelRow
                  step="03"
                  label="Evaluation"
                  description="Scores the tailored resume 1-100 for callback probability across keyword alignment, evidence quality, domain depth, and differentiation."
                  options={EVALUATION_MODELS}
                  value={modelKey(settings.evaluation.provider, settings.evaluation.model)}
                  onChange={setEvaluation}
                />

                <Divider />

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSettings(DEFAULT_SETTINGS)}
                    className="text-[10px] font-mono text-rose-400 hover:text-rose-600 transition-colors"
                  >
                    Reset to defaults
                  </button>
                  <Button
                    onClick={handleSave}
                    icon={Save}
                    className="font-mono text-xs"
                  >
                    {saved ? "Saved ✓" : "Save Preferences"}
                  </Button>
                </div>
              </Card>
            </TabPanel>

            {/* ── Tab 2: Usage Guide ────────────────────────────────────────── */}
            <TabPanel>
              <Card className="p-6 border border-tremor-border space-y-5">
                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-widest text-tremor-content-strong mb-2">
                    Getting Started
                  </p>
                  <ol className="flex flex-col gap-2">
                    {[
                      ["01", "Get a Groq API key at console.groq.com (free tier available)"],
                      ["02", "Get a Together AI key at api.together.ai (serverless credits available)"],
                      ["03", `Paste both keys into your .env.local file:\n   GROQ_API_KEY=gsk_...\n   TOGETHER_API_KEY=...`],
                      ["04", "Restart the dev server (Ctrl+C → npm run dev)"],
                      ["05", "Upload your resume PDF, paste the target JD, and hit Optimise"],
                    ].map(([n, text]) => (
                      <li key={n} className="flex gap-3">
                        <span className="text-[10px] font-mono font-bold text-indigo-500 shrink-0 mt-0.5">{n}.</span>
                        <span className="text-xs font-mono text-tremor-content leading-snug whitespace-pre-line">{text}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <Divider />

                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-widest text-tremor-content-strong mb-2">
                    Model Tiers Explained
                  </p>
                  <div className="flex flex-col gap-3">
                    {[
                      { label: "Groq 8B (Extraction)", badge: "groq", desc: "Ultra-fast, near-zero quota cost. Used for structured JSON parsing only." },
                      { label: "Together 70B Turbo (Optimise)", badge: "together", desc: "Serverless. High context window and instruction-following for precise bullet rewriting." },
                      { label: "Together Llama 70B Turbo (Evaluate)", badge: "together", desc: "Serverless. High-reasoning model for the 1-100 callback probability score. Not all models are available on the Together serverless tier." },
                    ].map(({ label, badge, desc }) => (
                      <div key={label} className="flex gap-3 items-start">
                        <span className={`mt-0.5 shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          badge === "groq" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
                        }`}>{badge}</span>
                        <div>
                          <p className="text-[10px] font-mono font-bold text-tremor-content-strong">{label}</p>
                          <p className="text-[10px] font-mono text-tremor-content leading-snug">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Divider />

                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-widest text-tremor-content-strong mb-2">
                    Automatic 429 Failover
                  </p>
                  <p className="text-xs font-mono text-tremor-content leading-relaxed">
                    If Groq returns a rate-limit error (429) during Optimise, the dashboard automatically retries
                    with Together AI&apos;s <code className="bg-stone-100 px-1 rounded">Llama-3.3-70B-Instruct-Turbo</code> and shows
                    an amber toast. No action required.
                  </p>
                </div>
              </Card>
            </TabPanel>

          </TabPanels>
        </TabGroup>
      </div>
    </div>
  );
}
