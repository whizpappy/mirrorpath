export interface Project {
  name: string;
  description: string;
  link?: string;
  technologies?: string[];
  bullets?: string[];
}

export interface Experience {
  company: string;
  role: string;
  dates: string;
  bullets: string[];
}

export interface Education {
  institution: string;
  degree: string;
  dates: string;
}

export interface PersonalDetails {
  name: string;
  email: string;
  phone?: string;
  linkedin?: string;
  website?: string;
}

export interface SkillCategory {
  category: string;
  items: string[];
}

export interface ResumeSchema {
  PersonalDetails: PersonalDetails;
  ProfessionalSummary: string;
  Experience: Experience[];
  Education: Education[];
  Skills: SkillCategory[];
  Projects?: Project[];
}

// ── Learning Loop ────────────────────────────────────────────────────────────
/** One entry in the localStorage learning journal */
export interface LearningEntry {
  strategy: string;    // e.g. "For Fintech roles, use 'covenants' not 'agreements'"
  timestamp: string;   // ISO string
}

// ── Evaluation Result ────────────────────────────────────────────────────────
/** Shape returned by /api/evaluate */
export interface EvaluationResult {
  score: number;
  status: string;
  reasoning: string[];
  killer_bullet: string;
}
