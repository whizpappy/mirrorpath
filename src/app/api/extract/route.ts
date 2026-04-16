import { NextResponse } from "next/server";
import { generateCompletion, stripFences } from "@/lib/llm";
import { Provider, DEFAULT_SETTINGS } from "@/types/settings";
import mammoth from "mammoth";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
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

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      // pdf-parse v2 only exports named classes — no default function export.
      // Using require() at call-site keeps webpack from bundling it;
      // Node resolves it natively via experimental.serverComponentsExternalPackages.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const { PDFParse } = require("pdf-parse") as { PDFParse: new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } };
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      rawText = result.text;
      await parser.destroy().catch(() => { /* ignore cleanup errors */ });
    } else if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or DOCX file." },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted. The file may be scanned or image-based." },
        { status: 400 }
      );
    }

    const content = await generateCompletion({
      provider,
      model,
      messages: [
        {
          role: "system",
          // Compressed prompt — saves input tokens on the 8B model.
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
    console.error("Extraction error:", error);

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
      { error: errMsg || "Failed to extract resume data." },
      { status: 500 }
    );
  }
}
