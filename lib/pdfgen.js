/**
 * PDF generation module — template router.
 * Takes structured resume data (from schema.js) and delegates to
 * the appropriate template renderer.
 */

import { jsPDF } from 'jspdf';
import { renderClassic } from './templates/classic.js';
import { renderModern } from './templates/modern.js';
import { renderCompact } from './templates/compact.js';
import { renderExecutive } from './templates/executive.js';

// Template registry
const TEMPLATES = {
  classic: renderClassic,
  modern: renderModern,
  compact: renderCompact,
  executive: renderExecutive,
};

/**
 * Generate and download the tailored resume as PDF.
 *
 * @param {object}  resumeData  - structured resume data from schema
 * @param {object}  metrics     - { totalWords, estimatedPages }
 * @param {string}  filename    - output filename
 * @param {string}  template    - template name (default: 'classic')
 */
export async function downloadResumePdf(resumeData, metrics, filename, template = 'classic') {
  const renderer = TEMPLATES[template];
  if (!renderer) {
    throw new Error(`Unknown template: "${template}". Available: ${Object.keys(TEMPLATES).join(', ')}`);
  }

  const targetPages = metrics?.estimatedPages || 1;

  // Create a measuring doc for dry runs (the template uses it internally)
  // Then create a fresh doc for the final render
  const doc = new jsPDF({
    unit: 'pt',
    format: 'letter',
    orientation: 'portrait',
  });

  console.log(`[CHARIS] Rendering with template: ${template}, target: ${targetPages} page(s)`);

  renderer(doc, resumeData, targetPages);

  doc.save(filename || 'tailored_resume.pdf');
}
