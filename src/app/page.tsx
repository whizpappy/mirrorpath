"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ResumeSchema, EvaluationResult } from "@/types/schema";
import {
  MirrorPathSettings,
  DEFAULT_SETTINGS,
  LS_SETTINGS_KEY,
} from "@/types/settings";

// ── Dynamic import — ssr: false prevents @react-pdf/renderer from running
// on the server, which crashes because it calls browser APIs (DOMMatrix etc.)
const PDFPreviewer = dynamic(() => import("@/components/PDFPreviewer"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full min-h-[600px] bg-stone-100 animate-pulse rounded-lg" />
  ),
});
import { Toast, ToastProps } from "@/components/Toast";
import { Loader2, Sparkles, UploadCloud, CheckCircle2, XCircle, Brain, Settings } from "lucide-react";
import { RiCloseLine } from "@remixicon/react";
import {
  Card,
  Textarea,
  Divider,
  AccordionList,
  Accordion,
  AccordionHeader,
  AccordionBody,
  Callout,
  Badge,
} from "@tremor/react";

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_LEARNINGS_KEY = "mirrorpath_learnings";
const MAX_LEARNINGS    = 10;
const RATE_LIMIT_MSG   =
  "Groq Rate Limit Reached. Please wait 10 minutes or upgrade your Groq API tier at console.groq.com.";

// ── Together AI failover config ──────────────────────────────────────────────
// Must always point to a serverless/Turbo model — dedicated-endpoint models
// (e.g. Llama-4-Scout) return 400 on the serverless Together API.
const TOGETHER_FAILOVER = {
  provider: "together" as const,
  model:    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
};

// Model IDs that require dedicated Together endpoints — reject if found in cache.
// These models are not available on the Together serverless tier and will
// be evicted from saved settings to avoid 400/403 errors.
const DEDICATED_ENDPOINT_IDS = [
  "Llama-4-Scout",
];

// ── Default resume ────────────────────────────────────────────────────────────
const DEFAULT_RESUME: ResumeSchema = {
  PersonalDetails: {
    name:     "Mubarak Babajide",
    email:    "mubarak@example.com",
    phone:    "+44 7XXX XXXXXX",
    linkedin: "linkedin.com/in/mubarak-babajide",
  },
  ProfessionalSummary:
    "Senior Product Designer with 5+ years designing mission-critical interfaces for Fintech and Legal-tech platforms. Specialist in AI-native UX, design systems, and 0-to-1 product ownership. Global Talent Visa holder — available immediately, no sponsorship required.",
  Experience: [
    {
      company: "Your Company",
      role:    "Senior Product Designer",
      dates:   "2022 - Present",
      bullets: [
        "Led the 0-to-1 design of a regulated identity infrastructure product, reducing onboarding friction by 38%.",
        "Built and maintained a component-level design system adopted across 4 product squads.",
        "Partnered with engineering to ship an AI-native explainability dashboard for compliance teams.",
      ],
    },
  ],
  Education: [
    {
      institution: "Your University",
      degree:      "B.Sc. Design / Computer Science",
      dates:       "2016 - 2020",
    },
  ],
  Skills: [
    { category: "Design",      items: ["Figma", "Prototyping", "Design Systems", "UX Research"] },
    { category: "Domain",      items: ["Fintech", "Legal-tech", "AI-native UX", "ATS Workflows"] },
    { category: "Engineering", items: ["React", "TypeScript", "Next.js"] },
  ],
  Projects: [
    {
      name:         "Passpoint — AI Compliance UX",
      description:  "Designed the end-to-end UX for a regulated KYC flow serving 50k+ users.",
      technologies: ["Figma", "React", "AI/ML APIs"],
      bullets: [
        "Owned the 0-to-1 design of a mission-critical identity verification flow under FCA regulatory constraints.",
        "Reduced user drop-off at the document upload step by 44% through progressive disclosure patterns.",
        "Delivered an AI explainability layer that surfaced structured reasoning to compliance officers in real-time.",
      ],
    },
  ],
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ── Company name extractor ────────────────────────────────────────────────────
/**
 * Best-effort heuristic to pull a company name from a JD string.
 * Returns a filesystem-safe slug, or "" if nothing is found.
 */
function extractCompanyFromJD(jd: string): string {
  if (!jd) return "Tailored";

  // High-priority explicit match: handles leading "At Acme" and "Join Acme as"
  const explicit = jd.match(/^At\s+([A-Z][A-Za-z0-9]+)/i) || jd.match(/Join\s+([A-Z][A-Za-z0-9]+)\s+as/i);
  if (explicit?.[1]) {
    const name = explicit[1].trim();
    if (/^you$/i.test(name)) return "Tailored";
    return name.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").slice(0, 30);
  }

  // Advanced fallback: pick the first non-empty line that is NOT a common section header
  const lines = jd.split('\n').map((l) => l.trim());
  const candidateLine = lines.find((line) => line && !line.toLowerCase().includes('about') && !line.toLowerCase().includes('responsibilities') && !line.toLowerCase().includes('requirements')) || "";
  let candidate = candidateLine.replace(/at\s+/i, '').split(' ')[0] || '';
  candidate = candidate.trim();
  if (!candidate || /^you$/i.test(candidate)) return "Tailored";
  return candidate.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").slice(0, 30);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StepLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-mono font-bold text-indigo-500">{n}.</span>
      <span className="text-xs font-mono font-bold uppercase tracking-widest text-tremor-content-emphasis">
        {label}
      </span>
    </div>
  );
}

function LearningsBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-500">
      <Brain size={11} />
      <span>{count} pattern{count !== 1 ? "s" : ""} loaded</span>
    </div>
  );
}

function ProviderBadge({ settings }: { settings: MirrorPathSettings }) {
  const isGroq    = settings.optimization.provider === "groq";
  const isTogether = settings.optimization.provider === "together";
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono">
      <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
        isGroq    ? "bg-violet-100 text-violet-700" :
        isTogether ? "bg-blue-100  text-blue-700"   : "bg-stone-100 text-stone-500"
      }`}>
        {settings.optimization.provider}
      </span>
      <span className="text-tremor-content truncate max-w-[140px]" title={settings.optimization.model}>
        {settings.optimization.model.split("/").pop()}
      </span>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [jd, setJd]                       = useState("");
  const [resumeJsonStr, setResumeJsonStr]  = useState("");
  const [outputData, setOutputData]        = useState<ResumeSchema>(DEFAULT_RESUME);
  const [masterFile, setMasterFile]        = useState<File | null>(null);
  const [isParsed, setIsParsed]            = useState(false);

  // isClient prevents PDF components from mounting until the browser is active.
  // Belt-and-suspenders alongside the dynamic({ ssr: false }) on PDFPreviewer.
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  const [isExtracting, setIsExtracting]  = useState(false);
  const [isOptimizing, setIsOptimizing]  = useState(false);
  const [isOptimized, setIsOptimized]    = useState(false);
  const [isEvaluating, setIsEvaluating]  = useState(false);
  const [error, setError]                = useState<string | null>(null);
  const [jsonError, setJsonError]        = useState<string | null>(null);

  const [evaluation, setEvaluation]      = useState<EvaluationResult | null>(null);
  const [pdfVersion, setPdfVersion]      = useState(0);
  const [learnings, setLearnings]        = useState<string[]>([]);
  const [settings, setSettings]          = useState<MirrorPathSettings>(DEFAULT_SETTINGS);
  const [toast, setToast]                = useState<ToastProps | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Evaluation — fires whenever a new optimised result arrives ───────────
  // Keyed on outputData + isOptimized so it re-fires on every Optimise run.
  // useEffect guarantees React has committed the new outputData before the
  // fetch fires — the old IIFE approach was racing state commits.
  useEffect(() => {
    if (!isOptimized || !outputData || !jd) return;
    let cancelled = false;
    setIsEvaluating(true);
    fetch("/api/evaluate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: outputData, jobDescription: jd }),
    })
      .then(res => res.ok ? (res.json() as Promise<EvaluationResult>) : null)
      .then(data => { if (!cancelled && data) setEvaluation(data); })
      .catch(err => { console.error("[evaluate]", err); })
      .finally(() => { if (!cancelled) setIsEvaluating(false); });
    return () => { cancelled = true; };
    // jd is captured at the render where outputData changed — that is the JD
    // used for this optimisation run, which is exactly what we want to score.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputData, isOptimized]);

  // Load learnings + settings from localStorage on mount.
  // Also evicts any saved settings that point to dedicated-endpoint model IDs
  // (those return 400 on the Together AI serverless API).
  useEffect(() => {
    try {
      const rawL = localStorage.getItem(LS_LEARNINGS_KEY);
      if (rawL) setLearnings(JSON.parse(rawL) as string[]);

      const rawS = localStorage.getItem(LS_SETTINGS_KEY);
      if (rawS) {
        const saved = JSON.parse(rawS) as MirrorPathSettings;
        const hasStaleModel = DEDICATED_ENDPOINT_IDS.some(
          (id) =>
            saved.optimization?.model?.includes(id) ||
            saved.evaluation?.model?.includes(id)
        );
        if (hasStaleModel) {
          // Silently reset to safe defaults — will toast once on next Optimise
          localStorage.removeItem(LS_SETTINGS_KEY);
          setSettings(DEFAULT_SETTINGS);
        } else {
          setSettings({ ...DEFAULT_SETTINGS, ...saved });
        }
      }
    } catch { /* ignore corrupt storage */ }
  }, []);

  // ── File reset ────────────────────────────────────────────────────────────
  const handleRemoveFile = () => {
    setMasterFile(null);
    setIsParsed(false);
    setResumeJsonStr("");
    setOutputData(DEFAULT_RESUME);
    setError(null);
    setJsonError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── File upload + extract ─────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File is too large. Maximum allowed size is 10 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setMasterFile(file);
    setError(null);
    setIsParsed(false);
    setResumeJsonStr("");

    try {
      setIsExtracting(true);
      const formData = new FormData();
      formData.append("file",     file);
      formData.append("provider", settings.extraction.provider);
      formData.append("model",    settings.extraction.model);

      const res = await fetch("/api/extract", { method: "POST", body: formData });

      if (!res.ok) {
        if (res.status === 429) throw new Error(RATE_LIMIT_MSG);
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || "Failed to extract resume.");
      }

      const data = await res.json();
      setResumeJsonStr(JSON.stringify(data, null, 2));
      setOutputData(data);
      setIsParsed(true);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to extract resume data.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Optimise (with 429 failover to Together AI) ───────────────────────────
  const handleOptimize = async () => {
    setError(null);
    setEvaluation(null);

    let parsedResume: ResumeSchema;
    try {
      parsedResume = JSON.parse(resumeJsonStr);
    } catch {
      setJsonError("Invalid JSON — fix syntax before optimising.");
      return;
    }

    // ── Inner fetch — reusable for primary + failover attempt ──────────────
    const runOptimize = async (provider: string, model: string) => {
      const res = await fetch("/api/optimize", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription:    jd,
          resume:            parsedResume,
          previousLearnings: learnings,
          provider,
          model,
        }),
      });
      return res;
    };

    try {
      setIsOptimizing(true);

      let res = await runOptimize(
        settings.optimization.provider,
        settings.optimization.model,
      );

      // ── Groq 429 → auto-failover to Together AI ────────────────────────
      if (res.status === 429 && settings.optimization.provider === "groq") {
        setToast({
          message: "Groq limit reached. Switching to Together AI (Llama 3.3 70B Turbo)…",
          type: "warning",
        });
        res = await runOptimize(TOGETHER_FAILOVER.provider, TOGETHER_FAILOVER.model);
      }

      if (!res.ok) {
        if (res.status === 429) throw new Error(RATE_LIMIT_MSG);
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || "Failed to optimise resume.");
      }

      const responseData = await res.json();
      const optimisedResume: ResumeSchema = responseData.resume ?? responseData;
      const newLearning: string | undefined = responseData.newLearning;

      if (!optimisedResume.Experience) {
        throw new Error("The AI returned an incomplete response. Please try again.");
      }

      setOutputData(optimisedResume);
      setIsOptimized(true);
      setPdfVersion((v) => v + 1);

      // ── Persist new learning ───────────────────────────────────────────
      if (newLearning) {
        setLearnings((prev) => {
          const updated = [newLearning, ...prev].slice(0, MAX_LEARNINGS);
          try { localStorage.setItem(LS_LEARNINGS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
      }

    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to optimise resume.");
    } finally {
      setIsOptimizing(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const canOptimize =
    isParsed && jd.trim().length > 0 && !jsonError && !isOptimizing && !isExtracting;

  const isRateLimitError = error === RATE_LIMIT_MSG;

  return (
    <div className="min-h-screen p-8 max-w-[1600px] mx-auto bg-tremor-background-muted font-mono">

      {/* ── Toast ── */}
      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-tremor-content-strong uppercase font-mono">
            MirrorPath
          </h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm font-mono text-tremor-content">Strict ATS Copywriter &amp; Formatter</p>
            <LearningsBadge count={learnings.length} />
            <ProviderBadge settings={settings} />
          </div>
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-2 text-xs font-mono text-tremor-content hover:text-tremor-content-strong transition-colors border border-tremor-border rounded px-3 py-2 hover:bg-tremor-background"
        >
          <Settings size={13} />
          Settings
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ══ LEFT COLUMN ════════════════════════════════════════════════════ */}
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-0 p-0 overflow-hidden">

            {/* Step 01 */}
            <div className="p-6">
              <StepLabel n="01" label="MASTER RESUME" />
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.docx"
                onChange={handleFileUpload}
                disabled={isExtracting}
              />

              {masterFile ? (
                <div className="flex items-center justify-between gap-4 p-4 bg-tremor-background-subtle border border-tremor-border rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    {isExtracting ? (
                      <Loader2 size={18} className="animate-spin text-indigo-500 shrink-0" />
                    ) : isParsed ? (
                      <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle size={18} className="text-rose-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-semibold text-tremor-content-strong truncate max-w-[200px]">
                        {masterFile.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-tremor-content">
                          {(masterFile.size / 1024).toFixed(0)} KB
                        </span>
                        {isExtracting ? (
                          <span className="text-xs font-mono text-indigo-500">Parsing…</span>
                        ) : (
                          <span className={`inline-block text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                            isParsed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}>
                            {isParsed ? "PARSED" : "FAILED"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    disabled={isExtracting}
                    className="flex items-center gap-1 text-rose-500 hover:text-rose-600 text-xs font-mono font-semibold disabled:opacity-40 shrink-0"
                  >
                    <RiCloseLine size={14} />
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-tremor-border rounded-lg p-8 flex flex-col items-center justify-center bg-tremor-background-subtle cursor-pointer hover:bg-tremor-background transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="text-tremor-content-subtle mb-2" size={28} />
                  <p className="text-xs font-mono font-semibold text-tremor-content-emphasis">
                    Click to upload .pdf or .docx
                  </p>
                  <p className="text-xs font-mono text-tremor-content mt-1 text-center max-w-[240px]">
                    File will be parsed and structured to the internal schema via Groq.
                  </p>
                </div>
              )}
            </div>

            <Divider className="my-0" />

            {/* Step 02 */}
            <div className="p-6">
              <StepLabel n="02" label="MASTER DATA" />
              <AccordionList>
                <Accordion>
                  <AccordionHeader className="text-xs font-mono font-bold uppercase tracking-widest text-tremor-content-emphasis">
                    Structured JSON
                  </AccordionHeader>
                  <AccordionBody>
                    {isParsed ? (
                      <>
                        <p className="text-xs font-mono text-tremor-content mb-2">
                          Review and edit the extracted schema before optimising.
                        </p>
                        <Textarea
                          className="font-mono text-xs w-full min-h-[280px]"
                          value={resumeJsonStr}
                          onChange={(e) => {
                            const val = e.target.value;
                            setResumeJsonStr(val);
                            try { JSON.parse(val); setJsonError(null); }
                            catch  { setJsonError("Invalid JSON — fix syntax before optimising."); }
                          }}
                        />
                        {jsonError && (
                          <p className="mt-2 text-xs font-mono text-rose-600">{jsonError}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs font-mono text-tremor-content-subtle italic py-4 text-center">
                        Awaiting resume extraction…
                      </p>
                    )}
                  </AccordionBody>
                </Accordion>
              </AccordionList>
            </div>

            <Divider className="my-0" />

            {/* Step 03 */}
            <div className="p-6">
              <StepLabel n="03" label="TARGET JD — THE MIRROR" />
              <Textarea
                className="w-full font-mono min-h-[200px]"
                placeholder="Paste Target Job Description here to mirror the keywords and tone…"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </div>
          </Card>

          {/* Optimise button */}
          <button
            onClick={handleOptimize}
            disabled={!canOptimize}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-mono font-bold uppercase tracking-widest transition-colors text-white bg-indigo-500 border-indigo-500 hover:bg-indigo-600 hover:border-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isOptimizing ? "Optimising…" : "Optimise Resume"}
          </button>

          {/* Memory panel */}
          {learnings.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <AccordionList>
                <Accordion>
                  <AccordionHeader className="text-xs font-mono font-bold uppercase tracking-widest text-tremor-content-emphasis px-4">
                    <span className="flex items-center gap-2">
                      <Brain size={13} className="text-indigo-500" />
                      Learned Patterns ({learnings.length})
                    </span>
                  </AccordionHeader>
                  <AccordionBody>
                    <ul className="flex flex-col gap-3 px-2 pb-2">
                      {learnings.map((l, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Badge color="indigo" className="font-mono text-[9px] shrink-0 mt-0.5">
                            {String(i + 1).padStart(2, "0")}
                          </Badge>
                          <span className="text-xs font-mono text-stone-600 leading-snug">{l}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => { setLearnings([]); localStorage.removeItem(LS_LEARNINGS_KEY); }}
                      className="mt-2 mx-4 text-[10px] font-mono text-rose-400 hover:text-rose-600 transition-colors"
                    >
                      Clear all patterns
                    </button>
                  </AccordionBody>
                </Accordion>
              </AccordionList>
            </Card>
          )}

          {/* Error callouts */}
          {error && (
            isRateLimitError ? (
              <Callout title="Groq Rate Limit Reached" color="amber" className="font-mono text-sm">
                Please wait 10 minutes before trying again, or upgrade your Groq API tier at{" "}
                <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer"
                   className="underline text-amber-800 hover:text-amber-900">console.groq.com</a>.
              </Callout>
            ) : (
              <Callout title="Error" color="rose" className="font-mono text-sm">{error}</Callout>
            )
          )}
        </div>

        {/* ══ RIGHT COLUMN: PDF Preview + Evaluation ═════════════════════════ */}
        <div className="flex flex-col">
          {isClient ? (
            <PDFPreviewer
              data={outputData}
              version={pdfVersion}
              isOptimizing={isOptimizing}
              isOptimized={isOptimized}
              evaluation={evaluation}
              isEvaluating={isEvaluating}
              companyName={extractCompanyFromJD(jd)}
            />
          ) : (
            <div className="h-full min-h-[600px] bg-stone-100 animate-pulse rounded-lg" />
          )}
        </div>
      </div>
    </div>
  );
}
