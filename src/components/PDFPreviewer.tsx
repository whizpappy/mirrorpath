"use client";

import { ResumeSchema, EvaluationResult } from "@/types/schema";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ResumePDFWrapper = dynamic(() => import("./ResumePDFWrapper"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8 border border-stone-200 text-stone-500 font-mono h-full min-h-[400px]">
      Loading PDF Components...
    </div>
  ),
});

interface PDFPreviewerProps {
  data: ResumeSchema;
  version: number;
  isOptimizing: boolean;
  /** true once the user has completed at least one successful Optimise run */
  isOptimized: boolean;
  evaluation?: EvaluationResult | null;
  isEvaluating?: boolean;
  /** Sanitised company name slug extracted from the JD, used in the filename */
  companyName?: string;
}

export function PDFPreviewer({
  data,
  version,
  isOptimizing,
  isOptimized,
  evaluation,
  isEvaluating,
  companyName,
}: PDFPreviewerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isOptimizing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 border border-stone-200 text-stone-500 font-mono h-full min-h-[400px]">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs uppercase tracking-widest">Generating your tailored resume…</span>
      </div>
    );
  }

  if (!mounted || !data || !data.PersonalDetails) {
    return (
      <div className="flex items-center justify-center p-8 border border-stone-200 text-stone-500 font-mono h-full min-h-[400px]">
        Awaiting Optimization Data...
      </div>
    );
  }

  return (
    <ResumePDFWrapper
      data={data}
      version={version}
      isOptimized={isOptimized}
      evaluation={evaluation}
      isEvaluating={isEvaluating}
      companyName={companyName}
    />
  );
}
