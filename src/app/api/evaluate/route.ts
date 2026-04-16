import { NextResponse } from "next/server";
import { generateCompletion, stripFences } from "@/lib/llm";
import { ResumeSchema, EvaluationResult } from "@/types/schema";

// ── Safety net — returned only when the live LLM call fails ──────────────────
const MOCK_EVALUATION: EvaluationResult = {
  score: 92,
  status: "Analysis Pending",
  reasoning: ["System is warming up..."],
  killer_bullet: "Check back in 30 seconds.",
};

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a brutally honest Head of Design at a top-tier Fintech or Legal-tech firm with 15 years of hiring experience. Analyze the candidate for this specific role.

Score 0-100 across four axes (25 pts each):
- Keyword alignment: Are the JD's specific domain terms present?
- Evidence quality: Are bullets quantified? No vague generalities?
- Domain depth: Does the resume demonstrate domain understanding (Fintech, Legal-tech, Design Systems)?
- Differentiation: Visa status advantage, portfolio, 0-to-1 ownership?

Penalise: generic AI-sounding language, missing metrics, no domain vocabulary, poor keyword alignment.

Provide:
1. A score from 0-100.
2. A 1-sentence status verdict.
3. Exactly 4 reasoning bullets explaining the score.
4. One "killer bullet" — the single metric or achievement the candidate should emphasize most.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "score": <number 0-100>,
  "status": <"Shortlist Highly Likely" | "Strong Contender" | "Needs Refinement" | "Significant Gaps">,
  "reasoning": [<string>, <string>, <string>, <string>],
  "killer_bullet": <string>
}`;

// ── Model — confirmed serverless on Together AI ───────────────────────────────
const EVAL_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

export async function POST(request: Request) {
  let resume: ResumeSchema | undefined;
  let jobDescription: string | undefined;

  // ── Parse body ──────────────────────────────────────────────────────────────
  try {
    const body = await request.json();
    resume         = body.resume;
    jobDescription = body.jobDescription;
    console.log("[evaluate] body keys:", Object.keys(body));
    console.log("[evaluate] Experience count:", resume?.Experience?.length ?? "N/A");
    console.log("[evaluate] JD length:", jobDescription?.length ?? 0);
  } catch (e) {
    console.error("[evaluate] body parse error:", e);
    return NextResponse.json(MOCK_EVALUATION, { status: 200 });
  }

  if (!resume || !jobDescription) {
    console.warn("[evaluate] missing fields — returning mock");
    return NextResponse.json(MOCK_EVALUATION, { status: 200 });
  }

  // ── Live LLM analysis ────────────────────────────────────────────────────────
  try {
    console.log(`[evaluate] calling ${EVAL_MODEL} for live analysis`);

    const raw = await generateCompletion({
      provider: "together",
      model:    EVAL_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role:    "user",
          content: `Job Description:\n${jobDescription}\n\nTailored Resume:\n${JSON.stringify(resume, null, 2)}`,
        },
      ],
      temperature: 0.1,
      json: false, // system prompt demands raw JSON; json_object mode causes 400s on some configs
    });

    console.log("[evaluate] raw (first 400 chars):", raw?.slice(0, 400));

    const result = JSON.parse(stripFences(raw)) as EvaluationResult;
    result.score = Math.max(0, Math.min(100, Math.round(result.score)));

    // Basic shape validation — fall back to mock if the model returned garbage
    if (
      typeof result?.score !== "number" ||
      !result?.status ||
      !Array.isArray(result?.reasoning) ||
      typeof result?.killer_bullet !== "string"
    ) {
      console.warn("[evaluate] invalid result shape — falling back to mock");
      return NextResponse.json(MOCK_EVALUATION, { status: 200 });
    }

    console.log("[evaluate] score:", result.score, "| status:", result.status);
    return NextResponse.json(result);

  } catch (err) {
    console.error("[evaluate] LLM call failed — returning mock:", err);
    return NextResponse.json(MOCK_EVALUATION, { status: 200 });
  }
}
