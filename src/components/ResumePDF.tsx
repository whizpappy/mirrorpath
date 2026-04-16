import React from "react";
import { Font, Page, Text, View, Document, StyleSheet, Link } from "@react-pdf/renderer";
import { ResumeSchema } from "@/types/schema";

// ── Font registration ─────────────────────────────────────────────────────────
// Times-Roman is a guaranteed PDF built-in and is used as the page-level font
// for ALL body text.  Cambria is registered via CDN; if that fetch fails at
// render time the page falls back to Times-Roman automatically.
//
// Helvetica is kept ONLY for the U+2022 bullet glyph rendered in BulletList.
// Times-Roman / Cambria do NOT encode U+2022 — without this targeted override
// the bullet dot renders as a hollow rectangle (□).
try {
  Font.register({
    family: "Cambria",
    fonts: [
      { src: "https://cdn.jsdelivr.net/gh/nicowillis/fonts@master/Cambria.ttf",      fontWeight: "normal" },
      { src: "https://cdn.jsdelivr.net/gh/nicowillis/fonts@master/Cambria-Bold.ttf", fontWeight: "bold"   },
    ],
  });
} catch { /* CDN unreachable — Times-Roman page default remains active */ }

// ── PERMANENT IDENTITY ────────────────────────────────────────────────────────
const IDENTITY = {
  name:      "Mubarak Babajide",
  title:     "Senior Product Designer",
  status:    "London, UK  |  Global Talent Visa (No Sponsorship Required)",
  portfolio: "damolaux.framer.website",
  linkedin:  "linkedin.com/in/mubarak-babajide",
  email:     "mubarak@example.com",
  phone:     "",
} as const;

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",   // safe PDF built-in; Cambria overlaid when loaded
    padding: "0.75in",
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },

  // ── Header ──
  name: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 3,
  },
  status: {
    fontSize: 10,
    textAlign: "center",
    color: "#555555",
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 14,
  },
  link: {
    fontSize: 9,
    color: "#0000FF",
    textDecoration: "underline",
  },
  contactPlain: {
    fontSize: 9,
    textAlign: "center",
    marginBottom: 3,
  },

  // ── Sections ──
  section: {
    marginBottom: 12,
  },
  heading: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 4,
    borderBottom: "1pt solid #000",
    paddingBottom: 2,
    lineHeight: 1.25,
  },
  bodyText: {
    fontSize: 10,
    lineHeight: 1.25,
    marginBottom: 4,
  },

  // ── Experience / Project entries ──
  experienceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  companyText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  dateText: { fontSize: 10 },
  roleText: {
    fontSize: 10,
    fontStyle: "italic",
    marginBottom: 4,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
    lineHeight: 1.25,
  },
  // Small, Helvetica-only style for the single bullet glyph
  bullet: {
    fontSize: 10,
    lineHeight: 1.25,
    fontFamily: "Helvetica",
    width: 12,
  },
  bulletContent: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.25,
  },

  // ── Education ──
  eduRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
});

// ── Bold text parser ──────────────────────────────────────────────────────────
/**
 * Splits on every ** boundary; odd-indexed segments are rendered bold.
 * Handles null / undefined — returns a single empty Text node instead of
 * crashing on .split().
 *
 * "**Architected** a pipeline, reducing time by **38%**."
 * → ["", <bold>Architected</bold>, " a pipeline, reducing time by ", <bold>38%</bold>, "."]
 */
function renderFormattedText(text: string | null | undefined): React.ReactNode[] {
  if (!text) return [<Text key="empty"></Text>];
  const parts = text.split(/\*\*/);
  return parts.map((part, i) => {
    const isBold = i % 2 === 1;
    return (
      <Text key={i} style={isBold ? { fontWeight: "bold" } : undefined}>
        {part}
      </Text>
    );
  });
}

// ── Bullet list ───────────────────────────────────────────────────────────────
/**
 * Renders a bullet list.
 *
 * DOUBLE-BULLET FIX: The LLM is instructed not to include bullet chars but
 * sometimes adds • / - / * anyway.  The regex below strips any such leading
 * character before the PDF adds its own dot.  Without this, output reads "••".
 *
 * RECTANGLE FIX: U+2022 is not encoded in Times-Roman / Cambria.  We switch
 * to Helvetica exclusively for the dot glyph so it renders as a filled circle.
 */
function BulletList({ bullets }: { bullets?: string[] }) {
  if (!Array.isArray(bullets) || bullets.length === 0) return null;
  return (
    <>
          {bullets.map((b, i) => {
            // Two-step strip — order matters:
            // 1. Remove leading whitespace, •, and - (safe: none of these are bold markers).
            // 2. Remove a lone * used as a bullet (e.g. "* text") but NOT ** bold openers.
            //    Lookahead (?!\*) ensures "**Architected**" is never touched.
            //    e.g. "* **Led**..."   → "**Led**..."   ✓ (lone * stripped, ** kept)
            //    e.g. " • **Led**..."  → "**Led**..."   ✓ (space+• stripped, ** kept)
            //    e.g. "**Led**..."     → "**Led**..."   ✓ (nothing stripped)
            const cleanedText = (b ?? "")
              .replace(/^[\s•\-]+/, "")
              .replace(/^\*(?!\*)\s*/, "")
              .trim();
            return (
              <View key={i} style={styles.bulletItem}>
                {/* Exactly one Helvetica dot glyph, inline style to ensure encoding */}
                <Text style={{ fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.25 }}>• </Text>
                <Text style={styles.bulletContent}>{renderFormattedText(cleanedText)}</Text>
              </View>
            );
          })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const ResumePDF = ({ data }: { data: ResumeSchema }) => {
  // Guard: @react-pdf/renderer calls browser APIs (DOMMatrix, canvas, etc.).
  // If this component somehow reaches the server, return null rather than crash.
  if (typeof window === "undefined") return null;

  if (!data?.PersonalDetails || !Array.isArray(data.Experience)) {
    return (
      <Document>
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.bodyText}>Preparing document…</Text>
        </Page>
      </Document>
    );
  }

  const email = data.PersonalDetails?.email || IDENTITY.email;
  const phone = data.PersonalDetails?.phone || IDENTITY.phone;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>

        {/* ── PERMANENT HEADER ──────────────────────────────────────────── */}
        {/* 14pt Bold name / 11pt title / 10pt location+visa status         */}
        <View style={styles.section}>
          <Text style={styles.name}>{IDENTITY.name}</Text>
          <Text style={styles.title}>{IDENTITY.title}</Text>
          <Text style={styles.status}>{IDENTITY.status}</Text>
          <Text style={styles.contactPlain}>
            {email}{phone ? `  |  ${phone}` : ""}
          </Text>
          <View style={styles.contactRow}>
            <Link src={`https://${IDENTITY.portfolio}`} style={styles.link}>
              {IDENTITY.portfolio}
            </Link>
            <Link src={`https://www.${IDENTITY.linkedin}`} style={styles.link}>
              {IDENTITY.linkedin}
            </Link>
          </View>
        </View>

        {/* ── 1. PROFESSIONAL SUMMARY ───────────────────────────────────── */}
        {data.ProfessionalSummary ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Professional Summary</Text>
            <Text style={styles.bodyText}>
              {renderFormattedText((data.ProfessionalSummary ?? "").trim().replace(/^[^a-zA-Z0-9*]+/, ""))}
            </Text>
          </View>
        ) : null}

        {/* ── 2. EXPERIENCE ─────────────────────────────────────────────── */}
        {(data.Experience?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Professional Experience</Text>
            {(data.Experience ?? []).map((exp, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.companyText}>{exp?.company ?? ""}</Text>
                  <Text style={styles.dateText}>{exp?.dates ?? ""}</Text>
                </View>
                <Text style={styles.roleText}>{exp?.role ?? ""}</Text>
                    {/* Clean bullets as a guardrail against LLM-included bullet glyphs */}
                    <BulletList bullets={(exp?.bullets ?? []).map((t) => (t ?? "").trim().replace(/^[^a-zA-Z0-9*]+/, ""))} />
              </View>
            ))}
          </View>
        )}

        {/* ── 3. EDUCATION ──────────────────────────────────────────────── */}
        {(data.Education?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Education</Text>
            {(data.Education ?? []).map((edu, i) => (
              <View key={i} style={styles.eduRow}>
                <View>
                  <Text style={styles.companyText}>{edu?.institution ?? ""}</Text>
                  <Text style={styles.bodyText}>{edu?.degree ?? ""}</Text>
                </View>
                <Text style={styles.dateText}>{edu?.dates ?? ""}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 4. PROJECTS ───────────────────────────────────────────────── */}
        {(data.Projects?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>PROJECTS</Text>
            {(data.Projects ?? []).map((proj, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.companyText}>{proj?.name ?? ""}</Text>
                  {proj?.link ? (
                    <Link src={proj.link} style={styles.link}>{proj.link}</Link>
                  ) : null}
                </View>
                {(proj?.technologies?.length ?? 0) > 0 && (
                  <Text style={styles.roleText}>
                    {(proj?.technologies ?? []).join(", ")}
                  </Text>
                )}
                {(proj?.bullets?.length ?? 0) > 0 ? (
                  <BulletList bullets={(proj?.bullets ?? []).map((t) => (t ?? "").trim().replace(/^[^a-zA-Z0-9*]+/, ""))} />
                ) : proj?.description ? (
                  <Text style={styles.bodyText}>
                    {renderFormattedText((proj.description ?? "").trim().replace(/^[^a-zA-Z0-9*]+/, ""))}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* ── 5. EXPERTISE / SKILLS ─────────────────────────────────────── */}
        {(data.Skills?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Expertise</Text>
            {(data.Skills ?? []).map((skill, i) => (
              <Text key={i} style={styles.bodyText}>
                <Text style={{ fontWeight: "bold" }}>{skill?.category ?? ""}: </Text>
                {(skill?.items ?? []).join(", ")}
              </Text>
            ))}
          </View>
        )}

      </Page>
    </Document>
  );
};
