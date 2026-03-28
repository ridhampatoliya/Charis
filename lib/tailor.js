/**
 * LLM tailoring module (template-based architecture).
 * Takes raw resume text + job description,
 * calls OpenAI to produce a structured resume JSON matching the schema.
 */

import { getApiKey } from './apikey.js';
import { validateResumeData, countResumeWords } from './schema.js';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-5.2';

// ============================================================
// Structured output schema (for the LLM prompt)
// ============================================================

const OUTPUT_SCHEMA = `{
  "name": "Full Name",
  "contact": {
    "email": "email@example.com",
    "phone": "+1 (555) 123-4567",
    "linkedin": "linkedin.com/in/name",
    "location": "City, State"
  },
  "summary": "2-3 sentence professional summary tailored to the target role.",
  "experience": [
    {
      "company": "Company Name",
      "location": "City, State",
      "title": "Job Title",
      "dates": "Start Date - End Date",
      "bullets": [
        "Achievement-oriented bullet point with metrics and impact.",
        "Another bullet point..."
      ]
    }
  ],
  "education": [
    {
      "school": "University Name",
      "location": "City, State",
      "degree": "Degree Name, Major",
      "dates": "Graduation Date or Date Range",
      "gpa": "GPA if present (optional)",
      "details": ["Relevant coursework, honors, or activities (optional)"]
    }
  ],
  "skills": {
    "Category Name": ["Skill 1", "Skill 2", "Skill 3"],
    "Another Category": ["Skill A", "Skill B"]
  },
  "certifications": [
    { "name": "Certification Name", "dates": "Date (optional)" }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "bullets": ["Detail 1", "Detail 2"]
    }
  ],
  "alignmentSummary": "2-3 sentence overview of gaps or confirmation that none exist.",
  "alignmentGaps": [
    "Specific gap or misalignment that could not be honestly addressed."
  ],
  "alignmentSummary": "2-3 sentence overview of gaps or confirmation that none exist.",
  "alignmentGaps": [
    "Specific gap or misalignment that could not be honestly addressed."
  ],
  "totalWords": 500,
  "changes": "Brief 2-3 sentence summary of key changes made."
}`;

// ============================================================
// Tailoring modes
// ============================================================

const MODES = {
  conservative: {
    temperature: 0.5,
    buildSystemPrompt: buildConservativeSystemPrompt,
  },
  aggressive: {
    temperature: 0.8,
    buildSystemPrompt: buildAggressiveSystemPrompt,
  },
  wizard: {
    temperature: 1.05,
    buildSystemPrompt: buildWizardSystemPrompt,
  },
};

function globalGuidelines() {
  return `## GLOBAL RULES
You are a professional resume optimization assistant. Your task is to optimize a resume so it aligns with the provided job description while preserving factual integrity.

### CRITICAL RULES
- Do NOT fabricate experience, metrics, companies, tools, dates, responsibilities, or achievements.
- Only use information present in the resume; you may reword, reorder, and emphasize but never invent facts.
- Preserve factual integrity at all times and maintain ATS compatibility (no graphics, tables, or symbols).
- Use strong, professional, concise action verbs and do not exaggerate beyond what the resume supports.
- You may infer positioning if it is clearly implied, but never add unsupported content.

### VALIDATION CHECK
Before finalizing, compare your output to the original resume and confirm:
- No new metrics or tools were introduced.
- No employment dates changed.
- No responsibilities were fabricated.
- Any job-title adjustments remain truthful and defensible.
If any violation exists, fix it before returning the JSON.`;
}

/** Shared preservation rules used by all modes. */
function sharedPreservationRules() {
  return `## CRITICAL PRESERVATION RULES
1. **Keep ALL job entries / positions / roles.** Every company, every role, every date range in the original MUST appear in your output. DO NOT drop, merge, or omit any job entry.
2. Keep the same number of bullet points per job entry (approximately ±1).
3. Keep all factual information accurate — same companies, dates, degrees, certifications.
4. Keep the total word count within ±15% of the original.
5. DO NOT fabricate experience, companies, metrics, degrees, or certifications not in the original resume.
6. If the original has a summary/objective section, include one. If it doesn't, you may add a brief 1-2 sentence summary.
7. Preserve ALL education entries, ALL certifications, ALL projects from the original.`;
}

/** Shared output format instructions. */
function outputFormatInstructions() {
  return `## REQUIRED OUTPUT FORMAT
Return ONLY a valid JSON object with this exact structure. No markdown, no commentary, no wrapping.

${OUTPUT_SCHEMA}

IMPORTANT RULES FOR THE JSON:
- Include ALL fields that exist in the original resume. Omit optional fields (certifications, projects) ONLY if they don't exist in the original.
- "experience" array must be ordered from most recent to oldest (same as original).
- "skills" should be an object with category keys. If the original has no categories, use a single key "Skills".
- "bullets" arrays should contain strings WITHOUT bullet characters (no •, -, *). The template adds those.
- Every string value must be plain text, no markdown or HTML.
- "totalWords" should be your estimate of total words in the content.
- "changes" should be a 2-3 sentence summary of what you changed.`;
}

function summaryRequirements() {
  return `## SUMMARY REQUIREMENTS
- Write 2-3 sentences that clearly reference the target role; paraphrase or use a closely-related title instead of copying the JD title verbatim (e.g., say “enterprise supply-chain leader” instead of “Staff Advanced Planning Solutions Engineer”).
- Cite concrete evidence from the resume (company names, scope, years, metrics) to prove credibility.
- Pull at least one crucial responsibility or keyword straight from the job description when it's supported by the candidate's experience.
- Avoid generic filler; each sentence must communicate a unique, job-aligned value proposition.`;
}

/**
 * Conservative mode: safe, keyword-focused rewrite.
 */
function buildConservativeSystemPrompt() {
  return `You are an expert resume writer. Your job is to extract and REWRITE a resume into a structured JSON format, tailored to a specific job description while staying close to the original content.

${globalGuidelines()}

## MODE: STEADY (Conservative)
Optimize the resume to better align with the job description without changing the underlying facts.

### INSTRUCTIONS
- Identify key skills, tools, and keywords from the job description and mirror that terminology when it accurately reflects the candidate's experience.
- Reword bullet points for clarity, alignment, and stronger action verbs while preserving the original meaning and scope.
- Replace equivalent terms with JD language when accurate.
- Reorder bullet points within a role to surface the most relevant content first.
- Keep sections and roles structurally similar to the source.

### STRICT DO-NOTS
- Do NOT change job titles, employment dates, or scope of responsibilities.
- Do NOT add or exaggerate metrics, tools, or achievements.
- Do NOT restructure entire roles or add new responsibilities.

### FOCUS AREAS
- Keyword alignment and ATS optimization.
- Minor phrasing improvements that highlight impact.
- Strong, professional tone while staying concise.

${sharedPreservationRules()}

${summaryRequirements()}

${outputFormatInstructions()}`;
}

/**
 * Aggressive mode: creative reframing, title alignment, stronger impact.
 */
function buildAggressiveSystemPrompt() {
  return `You are an elite resume strategist. Your job is to extract and TRANSFORM a resume into a structured JSON format, making the candidate look like the ideal hire for the target role.

${globalGuidelines()}

## MODE: AGGRESSIVE
Deeply optimize the resume so it strongly aligns with the job description.

### INSTRUCTIONS
- Extract the job description's core competencies, priorities, and themes, then spotlight them across the resume.
- Reorder and rewrite bullet points to emphasize impact, ownership, scale, and business outcomes clearly supported by the source material.
- Strengthen language with strategic storytelling and decisive verbs.
- Reorder bullets within each role to push the most relevant content to the top.
- Mirror JD terminology wherever it truthfully describes existing experience.

### STRICT RULES
- Do NOT fabricate metrics, tools, companies, responsibilities, or achievements.
- Do NOT modify employment dates or materially inflate scope beyond what the resume supports.
- Title adjustments must remain truthful, recognizable, and at the same seniority.

### ENHANCEMENTS ALLOWED
- Clarify implied ownership or quantify impact when the source clearly suggests it.
- Group related bullets, remove irrelevant items, and reposition sections to highlight strengths.
- Infer adjacent skills or framing only when obviously supported by the resume.

${sharedPreservationRules()}

${summaryRequirements()}

${outputFormatInstructions()}`;
}

/**
 * Wizard mode: maximal creativity with guarded title adjustments.
 */
function buildWizardSystemPrompt() {
  return `You are a fearless executive positioning specialist. Your job is to extract the resume, then remaster it into a structured JSON format that feels like a visionary, high-impact reinvention — still truthful, but relentlessly focused on the target role.

${globalGuidelines()}

## MODE: WIZARD
Transform the resume into a highly aligned, strategically positioned version tailored to the job description.

### INSTRUCTIONS
- Reverse-engineer the hiring intent behind the JD and identify the ideal candidate profile.
- Strategically reposition the candidate as that profile using ONLY existing resume content.
- Rewrite bullets with compelling executive storytelling that emphasizes ownership, scale, strategic thinking, and measurable business impact.
- Reorder sections and bullets for maximum effect, removing irrelevant content when necessary.
- Highlight transferable strengths and weave in JD language wherever it is truthfully supported.

### TITLE ALIGNMENT RULES
- You may adjust job titles to closely related industry-standard equivalents (e.g., "Analyst" → "Data Analyst") if the responsibilities already prove that scope.
- You may align titles more closely to the target job title when the resume clearly supports the same function and scope (e.g., “Senior Analyst, Logistics Finance” → “Sr Analyst, Logistics AI Solutions” if the resume shows AI/analytics work in logistics finance).
- You may add descriptive modifiers that reflect the job description’s domain focus (e.g., append “AI Solutions,” “Strategic Operations,” or “Customer Success”) when the resume clearly demonstrates that expertise.
- Never inflate seniority (e.g., Analyst → Director) or introduce fiction.
- Any updated title must remain defensible based on the resume’s responsibilities, and bullets must substantiate the new phrasing.

### STRICT NON-FABRICATION POLICY
- No new companies, tools, certifications, projects, or metrics.
- No invented responsibilities or expanded scope beyond what the original resume clearly supports.
- Infer outcomes only when they are plainly implied by the source material.

### TONE
- Confident, executive-ready, and high-impact while staying truthful.

${sharedPreservationRules()}

${summaryRequirements()}

${outputFormatInstructions()}`;
}

/**
 * Build the user prompt with raw resume text and job description.
 */
function buildUserPrompt(rawText, metrics, jobTitle, jobCompany, jobDescription, refineInstruction) {
  const refineBlock = refineInstruction
    ? `\n## REFINE REQUEST\n${refineInstruction}\n`
    : '';
  return `## TARGET JOB
Title: ${jobTitle}
Company: ${jobCompany}

Job Description:
${jobDescription}

## ORIGINAL RESUME (raw text — extract and tailor into structured JSON)
Total words: ${metrics.totalWords} (your output should be ${Math.round(metrics.totalWords * 0.85)}–${Math.round(metrics.totalWords * 1.15)} words)
Target page count: ${metrics.estimatedPages} page(s)

--- BEGIN RESUME TEXT ---
${rawText}
--- END RESUME TEXT ---
${refineBlock}

## INSTRUCTIONS
1. Parse the resume text above and extract ALL information into the structured JSON format.
2. Tailor the content to be strongly aligned with the target job description.
3. Ensure EVERY job entry, education entry, and certification from the original appears in the output.
4. Make the professional summary reference the target role (paraphrase the title instead of copying it verbatim), cite concrete evidence from the resume (company names, scope, metrics, years), and weave in at least one critical responsibility from the job description.
5. If the target page count is 1, compress for fit: keep total words closer to 75–90% of the original, limit bullets to ~3–4 per role (drop the least relevant ones), keep bullets concise (aim 16–20 words max), and avoid multi-line bullets unless absolutely necessary. If needed, reduce summary to 2 sentences and trim low‑value skills.
6. Return ONLY the JSON object. No other text.`;
}

/**
 * Call OpenAI and return the structured resume data.
 * @param {object} opts
 * @param {string} opts.rawText - Full raw text of the resume
 * @param {object} opts.metrics - { totalWords, estimatedPages }
 * @param {string} opts.jobTitle
 * @param {string} opts.jobCompany
 * @param {string} opts.jobDescription
 * @param {string} opts.mode - 'conservative' (default), 'aggressive', or 'wizard'
 * @returns {object} Validated structured resume data
 */
export async function tailorResume({ rawText, metrics, jobTitle, jobCompany, jobDescription, mode = 'conservative', refineInstruction = null }) {
  const apiKey = await getApiKey();
  const modeConfig = MODES[mode] || MODES.conservative;
  const systemPrompt = modeConfig.buildSystemPrompt();
  const userPrompt = buildUserPrompt(rawText, metrics, jobTitle, jobCompany, jobDescription, refineInstruction);

  console.log(`[CHARIS] Mode: ${mode}, temperature: ${modeConfig.temperature}`);

  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: modeConfig.temperature,
  };
  requestBody.response_format = { type: 'json_object' };

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenAI response.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Failed to parse OpenAI response as JSON.');
  }

  // Validate against schema
  const validation = validateResumeData(parsed);
  if (!validation.valid) {
    console.error('[CHARIS] Schema validation failed:', validation.error);
    throw new Error(`Invalid resume data from LLM: ${validation.error}`);
  }

  // Count words and log comparison
  const outputWords = countResumeWords(validation.data);
  console.log(`[CHARIS] Word count — original: ${metrics.totalWords}, tailored: ${outputWords}`);

  return validation.data;
}

export async function generateWizardDebugReport({
  rawText,
  jobTitle,
  jobCompany,
  jobDescription,
  tailoredResume,
}) {
  const apiKey = await getApiKey();
  const systemPrompt = `You are a resume QA analyst. Compare the ORIGINAL resume text to the TAILORED resume JSON and write a plain-text debug report.

Rules:
- Do not fabricate details. If you are unsure, say "unknown".
- Provide reasons for removals or omissions.
- Focus on concrete edits, not generic advice.
- Output must be plain text with clear section headers.`;

  const userPrompt = `ORIGINAL RESUME (raw text):
${rawText}

TARGET JOB:
Title: ${jobTitle}
Company: ${jobCompany}
Description:
${jobDescription}

TAILORED RESUME JSON:
${JSON.stringify(tailoredResume, null, 2)}

Write a debug report with these sections:
1) Summary of Changes
2) Added or Expanded (what changed + why)
3) Modified/Rewritten (what changed + why)
4) Removed/Omitted (what was removed + why)
5) Left Unchanged (key items preserved)
6) Bullet Count by Role (original vs tailored, if inferable)
7) Risks/Notes`;

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI debug report error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenAI debug report response.');
  }
  return content.trim();
}
