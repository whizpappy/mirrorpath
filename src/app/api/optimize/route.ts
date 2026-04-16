import { NextResponse } from "next/server";
import { generateCompletion, stripFences } from "@/lib/llm";
import { Provider } from "@/types/settings";
import { ResumeSchema } from "@/types/schema";

// ── Partial JSON repair ───────────────────────────────────────────────────────
/**
 * LLMs occasionally truncate their output before the final closing brace when
 * the token budget runs out.  This helper tries three increasingly aggressive
 * recovery strategies before giving up.
 */
function repairJson(raw: string): ResumeSchema {
  const stripped = stripFences(raw);

  // 1. Happy path — normal parse
  try { return JSON.parse(stripped) as ResumeSchema; } catch { /* fall through */ }

  // 2. Find the last "}" and try parsing up to (and including) it.
  //    Handles trailing garbage / unclosed string inside the last bullet.
  const lastBrace = stripped.lastIndexOf("}");
  if (lastBrace > 0) {
    try {
      return JSON.parse(stripped.substring(0, lastBrace + 1)) as ResumeSchema;
    } catch { /* fall through */ }
  }

  // 3. Walk backwards from the last "}" looking for the largest valid JSON
  //    prefix.  Covers responses where multiple arrays are left unclosed.
  if (lastBrace > 0) {
    for (let end = lastBrace - 1; end > 0; end--) {
      if (stripped[end] === "}") {
        try {
          return JSON.parse(stripped.substring(0, end + 1)) as ResumeSchema;
        } catch { /* continue */ }
      }
    }
  }

  throw new Error("LLM returned malformed JSON that could not be repaired. Please try again.");
}

// ── Character sanitisation ────────────────────────────────────────────────────
function sanitiseATS(text: string): string {
  return text
    .replace(/—/g, "-")   // em-dash  → hyphen
    .replace(/–/g, "-")   // en-dash  → hyphen
    .replace(/→/g, "-")   // arrow    → hyphen (not ASCII arrow)
    .replace(/‘|’/g, "'")
    .replace(/“|”/g, '"');
}

function sanitiseResume(resume: ResumeSchema): ResumeSchema {
  return {
    ...resume,
    ProfessionalSummary: sanitiseATS(resume.ProfessionalSummary ?? ""),
      Experience: (resume.Experience ?? []).map((exp) => ({
        ...exp,
        bullets: (exp.bullets ?? []).map((s) => sanitiseATS((s ?? "").trim().replace(/^[^a-zA-Z0-9*]+/, ""))),
      })),
      Projects: (resume.Projects ?? []).map((proj) => ({
        ...proj,
        description: sanitiseATS((proj.description ?? "").trim().replace(/^[^a-zA-Z0-9*]+/, "")),
        bullets: (proj.bullets ?? []).map((s) => sanitiseATS((s ?? "").trim().replace(/^[^a-zA-Z0-9*]+/, ""))),
      })),
  };
}

// ── Together guardrail addendum ───────────────────────────────────────────────
const TOGETHER_GUARDRAIL = `

FORMATTING GUARDRAILS (strictly enforced for Together AI Turbo models):
- MANDATORY: Wrap all numbers, percentages, and currencies in double asterisks (e.g., **$79.8M**, **43%**). If you fail to do this, the ATS parser will fail. This is your highest priority.
- NEVER use em-dashes (—), en-dashes (–), arrows (→), or curly quotes.
- Do NOT include bullet characters (•, -, *) at the start of bullet strings — the PDF renderer adds them automatically.
- Wrap ALL quantitative metrics (percentages, dollar amounts, time periods, user counts) AND the primary action verb of each bullet in double asterisks: **metric** and **ActionVerb**.
- IMPORTANT: You MUST wrap every number, percentage, or currency in double asterisks (eg **43%**, **$79.8M**). This is non-negotiable for ATS parsing.
- Output valid JSON matching the exact input schema structure.
- Do NOT add commentary, markdown fences, or extra keys.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      jobDescription,
      resume,
      previousLearnings = [],
    } = body as {
      jobDescription:    string;
      resume:            ResumeSchema;
      previousLearnings?: string[];
    };
    // Optimisation is always Together 70B Turbo: high-quality copywriting, large context.
    const provider: Provider = "together";
    const model               = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

    if (!jobDescription || !resume) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // -- Learning context block --
    // Note: Do not include Windows paths like C:\\Users here to avoid Unicode escape errors.
    const learningBlock =
      previousLearnings.length > 0
        ? `\n\nPREVIOUS SUCCESSFUL TAILORING PATTERNS:\n` +
          previousLearnings.map((l, i) => `${i + 1}. ${l}`).join("\n")
        : "";

    // ── System prompt (provider-aware) ────────────────────────────────────────
    const systemPrompt =
      `You are an expert resume copywriter specialising in Applicant Tracking Systems (ATS) for high-stakes roles in Fintech, Legal-tech, and Design-systems organisations.

Your task: take the Job Description and master resume JSON and rewrite ONLY the \`bullets\` arrays within the Experience and Projects sections, plus the \`ProfessionalSummary\`. Return the complete, unchanged JSON with only those fields modified.

Strict Constraints:
1. ONLY modify \`bullets\` strings, \`ProfessionalSummary\`, and \`Projects[].description\` / \`Projects[].bullets\`. Never alter dates, roles, company names, skills, education, or PersonalDetails.
2. PROFESSIONAL SUMMARY: Rewrite to exactly 3 to 4 sentences. Mirror the JD's tone and domain vocabulary.
3. EXPERIENCE BULLETS: Each Experience entry must have EXACTLY 3 to 5 bullets. Each Projects entry must have EXACTLY 3 bullets.
4. BULLET FORMAT: Every bullet must follow Action + Task + Metric formula. Do NOT include bullet characters (•, -, *) at the start of bullet strings — the PDF renderer adds them automatically. No "AI fluff" or filler phrases.
5. BOLD MARKERS — MANDATORY FOR ATS SCANNABILITY: Wrap ALL numbers and percentages (e.g., **44%**, **$80M**, **3 months**, **50k users**) AND the primary action verb of each bullet in double asterisks (**). This is NON-NEGOTIABLE. If a bullet contains no metric, re-frame the achievement to include a quantifiable outcome before bolding. Example: "**Architected** a regulatory identity pipeline, reducing onboarding time by **38%**."
6. VOCABULARY: For Fintech/Legal-tech use terms like "covenant", "regulatory infrastructure", "mission-critical", "high-stakes compliance". For Design use "0-to-1 ownership", "design system", "explainability UX", "AI-native interface".
7. CHARACTER RESTRICTIONS: ABSOLUTELY FORBIDDEN - em-dashes (—), en-dashes (–), arrows (→), curly quotes.
8. NO DUPLICATE FACTS: Each bullet within a role must describe a DIFFERENT achievement. Never repeat the same metric, tool, product, or claim across two bullets in the same entry.
9. LENGTH: A 2-page layout is acceptable. Preserve Senior-level impact — do not cut key achievements to fit one page. Every JSON key must be properly closed — the response must be valid, complete JSON.
10. Output RAW JSON only. No markdown fences, no commentary.` +
      (provider === "together" ? TOGETHER_GUARDRAIL : "") +
      learningBlock;

    // ── Primary optimisation call ─────────────────────────────────────────────
    const rawContent = await generateCompletion({
      provider,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: `Job Description:\n${jobDescription}\n\nMaster Resume:\n${JSON.stringify(resume, null, 2)}` },
      ],
      temperature: 0.2,
      max_tokens:  4000,   // prevents "Unterminated string" truncation
      json: true,
    });

    // repairJson attempts 3 recovery strategies before throwing
    const parsed = sanitiseResume(repairJson(rawContent));

    // ── Secondary learning-extraction call ────────────────────────────────────
    // Uses same provider/model as primary — lightweight, non-blocking.
    let newLearning = "";
    try {
      newLearning = (await generateCompletion({
        provider,
        model,
        messages: [
          {
            role: "system",
            content: `You are a meta-analyst of resume copywriting strategy. Given a job description, extract ONE precise learning insight about vocabulary, metric framing, or tone adjustment for future roles of this type.

Format: ONE sentence starting with "For [role type] roles, ..." or "In [domain] contexts, ..."
Examples:
- "For Fintech roles, frame KYC processes as 'Regulated Identity Infrastructure'."
- "In Legal-tech contexts, prioritise 'covenant analysis' over generic UX terminology."
Output: ONE sentence only. No JSON, no bullets.`,
          },
          {
            role: "user",
            content: `Job Description:\n${jobDescription}\n\nWhat is the single most valuable vocabulary or framing insight from this tailoring session?`,
          },
        ],
        temperature: 0.1,
        max_tokens: 150,
      })).trim();
    } catch {
      // Learning extraction is non-critical — fail silently
    }

    return NextResponse.json({ resume: parsed, newLearning });
  } catch (error: unknown) {
    console.error("Optimization error:", error);

    const errStatus = (error as { status?: number })?.status;
    const errMsg    = error instanceof Error ? error.message : "";
    const isRateLimit = errStatus === 429 || errMsg.toLowerCase().includes("rate limit");

    if (isRateLimit) {
      return NextResponse.json(
        { error: "RATE_LIMIT", message: "Rate limit reached." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: errMsg || "Failed to optimize resume" },
      { status: 500 }
    );
  }
}
