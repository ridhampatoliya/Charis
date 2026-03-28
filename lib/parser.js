/**
 * Resume parser: PDF and DOCX → fullText + metrics.
 * No section detection — the full text is passed directly to the LLM
 * which outputs structured resume data.
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure PDF.js worker in extension context
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');
}

const WORDS_PER_PAGE_ESTIMATE = 300;

function countWords(str) {
  if (!str || !str.trim()) return 0;
  return str.trim().split(/\s+/).length;
}

function buildMetrics(fullText, estimatedPages) {
  const totalWords = countWords(fullText);
  return {
    totalWords,
    estimatedPages: estimatedPages ?? Math.max(1, Math.ceil(totalWords / WORDS_PER_PAGE_ESTIMATE)),
  };
}

/**
 * Parse PDF buffer → { fullText, metrics }.
 */
export async function parsePdf(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer).slice();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;
  const pageTexts = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item) => item.str !== undefined)
      .map((item) => (item.hasEOL ? item.str + '\n' : item.str))
      .join('');
    pageTexts.push(text);
  }

  const fullText = pageTexts.join('\n\n');
  const metrics = buildMetrics(fullText, numPages);

  return { fullText, metrics };
}

/**
 * Parse DOCX buffer → { fullText, metrics }.
 */
export async function parseDocx(arrayBuffer) {
  const result = await mammoth.extractRawText({ buffer: arrayBuffer });
  const fullText = result.value || '';
  const metrics = buildMetrics(fullText, null);

  return { fullText, metrics };
}

/**
 * Parse resume file. file: { name, type }, arrayBuffer.
 * Returns { fullText, metrics } or throws.
 */
export async function parseResumeFile(file, arrayBuffer) {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return parsePdf(arrayBuffer);
  }
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return parseDocx(arrayBuffer);
  }

  throw new Error('Unsupported format. Use PDF or DOCX.');
}
