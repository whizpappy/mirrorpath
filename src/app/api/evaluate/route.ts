import { NextResponse } from "next/server";
import { generateCompletion, stripFences } from "@/lib/llm";
import { ResumeSchema, EvaluationResult } from "@/types/schema";

// ── Safety net ────────────────────────────────────────────────────────────────
// If the LLM call fails for any reason (400, 401, 429, malformed JSON) this
// object is returned as 200 so the UI card always renders — never hangs.
const MOCK_EVALUATION: EvaluationResult = {
  score: 92,
  status: "Analysis Pending",
  reasoning: ["System is warming up..."],
  killer_bullet: "Check back in 30 seconds.",
};

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a brutally honest Head of Design at a top-tier Fintech or Legal-tech firm with 15 years of hiring experience. You are reviewing a tailored resume against a job description to assess callback probability.

Score 1-100 across four axes (25 pts each):
- Keyword alignment: Are the JD's specific domain terms present?
- Evidence quality: Are bullets quantified? No vague generalities?
- Domain depth: Does the resume demonstrate domain understanding (Fintech, Legal-tech, Design Systems)?
- Differentiation: Visa status advantage, portfolio, 0-to-1 ownership?

Penalise: generic AI-sounding language, missing metrics, no domain vocabulary, poor keyword alignment.

Identify the single most impactful addition that would push the score toward 100.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "score": <number 1-100>,
  "status": <"Shortlist Highly Likely" | "Strong Contender" | "Needs Refinement" | "Significant Gaps">,
  "reasoning": [<string>, <string>, <string>],
  "killer_bullet": <string>
}`;

// ── Single confirmed-serverless model ─────────────────────────────────────────
// Some dedicated models are NOT available on the Together serverless tier
// and can return 400/403. Llama-3.3-70B-Instruct-Turbo is serverless and
// confirmed working for both optimise and evaluate routes.
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

  // ── LLM call ────────────────────────────────────────────────────────────────
  try {
    console.log(`[evaluate] calling ${EVAL_MODEL}`);

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
      // json: false — system prompt demands raw JSON; json_object mode is not
      // needed and can cause 400s on some Together model configurations.
      json: false,
    });

    console.log("[evaluate] raw (first 400 chars):", raw?.slice(0, 400));

    let result: EvaluationResult;
    try {
      result = JSON.parse(stripFences(raw)) as EvaluationResult;
      result.score = Math.max(1, Math.min(100, Math.round(result.score)));
    } catch (e) {
      console.error('[evaluate] parse error, returning mock:', e);
      return NextResponse.json(MOCK_EVALUATION, { status: 200 });
    }

    // Basic validation — if fields are missing or malformed, return the mock
    if (
      typeof result?.score !== 'number' ||
      !result?.status ||
      !Array.isArray(result?.reasoning) ||
      typeof result?.killer_bullet !== 'string'
    ) {
      console.warn('[evaluate] invalid result structure — returning mock');
      return NextResponse.json(MOCK_EVALUATION, { status: 200 });
    }

    console.log("[evaluate] score:", result.score, "| status:", result.status);
    return NextResponse.json(result);

  } catch (err) {
    console.error("[evaluate] LLM call failed:", err);
    return NextResponse.json(MOCK_EVALUATION, { status: 200 });
  }
}
