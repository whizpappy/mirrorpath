"use client";

import React, { useEffect, useState } from "react";

import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { ResumePDF } from "./ResumePDF";
import { ResumeSchema, EvaluationResult } from "@/types/schema";
import { Download, Lock, Loader2, Target, Lightbulb, AlertTriangle, Clock } from "lucide-react";
import { DonutChart, Card, ProgressBar } from "@tremor/react";

interface Props {
  data: ResumeSchema;
  version: number;
  /** true once the user has completed at least one successful Optimise run */
  isOptimized: boolean;
  /** Evaluation result — undefined while not yet fetched, null while loading */
  evaluation?: EvaluationResult | null;
  isEvaluating?: boolean;
  /** Sanitised company name slug from the JD — used in the downloaded filename */
  companyName?: string;
}

// ── Score colour helpers ──────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 80) return "emerald";
  if (score >= 60) return "amber";
  return "rose";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-50 border-emerald-200";
  if (score >= 60) return "bg-amber-50 border-amber-200";
  return "bg-rose-50 border-rose-200";
}

function scoreText(score: number) {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-rose-700";
}

function statusDot(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

// ── Evaluation Panel ──────────────────────────────────────────────────────────
function EvaluationPanel({
  evaluation,
  isEvaluating,
}: {
  evaluation?: EvaluationResult | null;
  isEvaluating?: boolean;
}) {
  // ProgressBar while the evaluation API is running
  if (isEvaluating) {
    return (
      <Card className="mt-4 p-6 border border-stone-200">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-indigo-500 shrink-0" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-500">
              Strict ATS Check in Progress…
            </span>
          </div>
          <ProgressBar value={66} color="indigo" className="h-1.5" />
          <p className="text-[10px] font-mono text-stone-400">
            Scoring keyword alignment, evidence quality, domain depth, and differentiation.
          </p>
        </div>
      </Card>
    );
  }

  // Placeholder — API not yet fired (first render after Optimise)
  if (!evaluation) {
    return (
      <Card className="mt-4 p-6 border border-stone-200">
        <div className="flex items-center gap-3 text-stone-400 font-mono text-xs">
          <Clock size={14} className="shrink-0" />
          <span className="uppercase tracking-widest">Waiting for analysis…</span>
        </div>
      </Card>
    );
  }

  const { score, status, reasoning, killer_bullet } = evaluation;
  const color = scoreColor(score);
  const donutData = [
    { name: "Score", value: score },
    { name: "Gap",   value: 100 - score },
  ];

  return (
    <Card className={`mt-4 border ${scoreBg(score)} p-0 overflow-hidden`}>
      {/* Header strip */}
      <div className="flex items-center gap-2 px-6 pt-5 pb-4 border-b border-stone-200">
        <div className={`w-2 h-2 rounded-full ${statusDot(score)}`} />
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-stone-700">
          Recruiter&apos;s Perspective
        </span>
        <span className={`ml-auto text-xs font-mono font-bold ${scoreText(score)}`}>
          {status}
        </span>
      </div>

      {/* Body — 3-column grid: chart | notes */}
      <div className="grid grid-cols-3 gap-0 p-0">

        {/* ── Col 1: DonutChart ── */}
        <div className="flex flex-col items-center justify-center p-8 gap-2 border-r border-stone-200">
          <div className="relative w-[120px] h-[120px]">
            <DonutChart
              data={donutData}
              category="value"
              index="name"
              colors={[color, "gray"] as unknown as string[]}
              showLabel={false}
              showTooltip={false}
              className="w-full h-full"
            />
            {/* Score centred inside the donut ring */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={`text-2xl font-mono font-bold ${scoreText(score)}`}>
                {score}
              </span>
              <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">
                / 100
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest text-center">
            Callback<br />Probability
          </span>
        </div>

        {/* ── Col 2-3: Recruiter's Notes ── */}
        <div className="col-span-2 flex flex-col gap-4 p-8">

          {/* Reasoning bullets */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target size={13} className="text-stone-400" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-500">
                Analysis
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {(reasoning ?? []).map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-stone-400 shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, "0")}.
                  </span>
                  <span className="text-[11px] font-mono text-stone-700 leading-snug">
                    {r}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Killer bullet */}
          {killer_bullet && (
            <div className="border-t border-stone-200 pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={13} className="text-amber-500" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-500">
                  Next Best Action
                </span>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded">
                <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] font-mono text-amber-800 leading-snug">
                  {killer_bullet}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Main wrapper ──────────────────────────────────────────────────────────────
export default function ResumePDFWrapper({
  data,
  version,
  isOptimized,
  evaluation,
  isEvaluating,
  companyName,
}: Props) {
  const safeCompany = (companyName || "Tailored").trim();
  const downloadName = `Mubarak_Resume_${safeCompany}.pdf`;

  // ── Download-ready gate ───────────────────────────────────────────────────
  // PDFDownloadLink triggers blob generation on mount. If it mounts at the
  // same time as PDFViewer (which is generating the preview blob) both compete
  // for the same renderer resources and the download link gets stuck on
  // "Preparing…". Delaying 500 ms lets the preview settle first.
  const [downloadReady, setDownloadReady] = useState(false);
  useEffect(() => {
    if (!isOptimized) return;
    const timer = setTimeout(() => setDownloadReady(true), 500);
    return () => clearTimeout(timer);
  }, [isOptimized]);

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ── Toolbar ── */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-tremor-content-subtle">
          Output Preview
        </h2>

        {isOptimized && downloadReady && data && (data.Experience ?? []).length > 0 ? (
          <PDFDownloadLink
            key={version}
            document={<ResumePDF data={data} />}
            fileName={downloadName}
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white px-4 py-2 text-xs font-mono font-semibold uppercase tracking-widest transition-colors rounded"
          >
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(({ loading }: { loading: boolean }) => (
              <>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {loading ? "Preparing…" : "Download PDF"}
              </>
            )) as unknown as React.ReactNode}
          </PDFDownloadLink>
        ) : isOptimized ? (
          // Optimised but 500ms window hasn't elapsed yet
          <button
            disabled
            className="inline-flex items-center gap-2 bg-slate-200 text-slate-400 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-widest rounded cursor-not-allowed"
          >
            <Loader2 size={14} className="animate-spin" />
            Preparing…
          </button>
        ) : (
          <button
            disabled
            className="inline-flex items-center gap-2 bg-slate-200 text-slate-400 px-4 py-2 text-xs font-mono font-semibold uppercase tracking-widest rounded cursor-not-allowed"
            title="Run Optimise first to unlock download"
          >
            <Lock size={14} />
            Download PDF
          </button>
        )}
      </div>

      {/* ── PDF Viewer ── keyed on version for reliable remounts ── */}
      <div className="flex-1 border border-tremor-border overflow-hidden bg-tremor-background-subtle p-2 min-h-[600px]">
        <PDFViewer key={version} className="w-full h-full" showToolbar={false}>
          <ResumePDF data={data} />
        </PDFViewer>
      </div>

      {/* ── Evaluation Panel — only visible after at least one Optimise run ── */}
      {isOptimized && (
        <EvaluationPanel evaluation={evaluation} isEvaluating={isEvaluating} />
      )}
    </div>
  );
}
