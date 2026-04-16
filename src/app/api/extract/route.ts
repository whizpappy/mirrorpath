import { NextResponse } from "next/server";
import { generateCompletion, stripFences } from "@/lib/llm";
import { Provider } from "@/types/settings";
import mammoth from "mammoth";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  // ── Env guard — fast-fail with a clear message rather than a cryptic 500 ───
  if (!process.env.GROQ_API_KEY) {
    console.error("EXTRACT_ERROR: Missing GROQ_API_KEY env variable.");
    return NextResponse.json(
      { error: "Server configuration error: GROQ_API_KEY is not set. Add it to .env.local and redeploy." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    // Extraction is always Groq llama-3.1-8b-instant: free, instant, zero quota cost.
    const provider: Provider = "groq";
    const model               = "llama-3.1-8b-instant";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 10 MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    let rawText = "";

    // ── PDF parsing ──────────────────────────────────────────────────────────
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      try {
        // pdf-parse is require()'d at call-site to keep webpack from bundling it.
        // Supports both v1 (function export) and v2 (class export) automatically.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfMod = require("pdf-parse");

        if (typeof pdfMod.PDFParse === "function") {
          // v2 class API: new PDFParse({ data: Uint8Array })
          const parser = new pdfMod.PDFParse({ data: new Uint8Array(buffer) });
          const result = await parser.getText();
          rawText = result.text ?? "";
          await parser.destroy().catch(() => { /* ignore cleanup errors */ });
        } else {
          // v1 function API: pdfParse(buffer) or pdfParse.default(buffer)
          const fn: (buf: Buffer) => Promise<{ text: string }> =
            typeof pdfMod === "function" ? pdfMod : pdfMod.default;
          const result = await fn(buffer);
          rawText = result.text ?? "";
        }
      } catch (pdfErr) {
        console.error("EXTRACT_ERROR: PDF parse failed:", pdfErr);
        return NextResponse.json(
          { error: "Please ensure your file is a valid, text-based PDF. Scanned or image-only PDFs are not supported." },
          { status: 400 }
        );
      }

    // ── DOCX parsing ──────────────────────────────────────────────────────────
    } else if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx")
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value ?? "";
      } catch (docxErr) {
        console.error("EXTRACT_ERROR: DOCX parse failed:", docxErr);
        return NextResponse.json(
          { error: "Please ensure your file is a valid .docx file." },
          { status: 400 }
        );
      }

    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or DOCX file." },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      console.error("EXTRACT_ERROR_DETAIL: Parser returned empty text for file:", file.name);
      return NextResponse.json(
        { error: "Parser Error: No text found. Check Vercel logs for detail." },
        { status: 500 }
      );
    }

    // ── LLM extraction ────────────────────────────────────────────────────────
    const content = await generateCompletion({
      provider,
      model,
      messages: [
        {
          role: "system",
          content:
            "Extract the resume text into this exact JSON schema. Preserve all metrics, dates, and names verbatim. Output RAW JSON only — no markdown fences.\n\n" +
            "Schema: { PersonalDetails: { name, email, phone?, linkedin?, website? }, ProfessionalSummary: string, " +
            "Experience: [{ company, role, dates, bullets: string[] }], " +
            "Education: [{ institution, degree, dates }], " +
            "Skills: [{ category, items: string[] }], " +
            "Projects?: [{ name, description, technologies?: string[], bullets?: string[] }] }",
        },
        {
          role: "user",
          content: rawText,
        },
      ],
      temperature: 0.1,
      json: true,
    });

    const parsed = JSON.parse(stripFences(content));

    if (!parsed.PersonalDetails || !parsed.Experience || !parsed.Education) {
      throw new Error("The AI returned an incomplete structure. Please try uploading again.");
    }

    return NextResponse.json(parsed);

  } catch (error: unknown) {
    console.error("EXTRACT_ERROR_DETAIL:", error);

    const errStatus = (error as { status?: number })?.status;
    const errMsg    = error instanceof Error ? error.message : "";
    const isRateLimit = errStatus === 429 || errMsg.toLowerCase().includes("rate limit");

    if (isRateLimit) {
      return NextResponse.json(
        { error: "RATE_LIMIT", message: "Rate limit reached." },
        { status: 429 }
      );
    }

    // Return 400 (not 500) so the frontend shows a user-readable message
    // rather than a generic "Failed to extract" crash.
    return NextResponse.json(
      { error: errMsg || "Please ensure your file is a valid PDF or .docx" },
      { status: 400 }
    );
  }
}
