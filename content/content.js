/**
 * Content script: runs on LinkedIn job pages (https://www.linkedin.com/jobs/*)
 * Extracts job title, company, and full description.
 *
 * Uses innerText (not textContent) to avoid picking up script/hidden content.
 * Waits for LinkedIn's dynamically-loaded job details with multiple fallback selectors.
 */
(function () {
  'use strict';

  const LINKEDIN_JOBS_REGEX = /^https:\/\/www\.linkedin\.com\/jobs\/.+/i;
  const SEE_MORE_TEXTS = ['see more', 'show more', 'see more…', 'show more…'];
  const EXPAND_WAIT_MS = 800;
  const ELEMENT_WAIT_MS = 6000; // max wait for elements to appear

  function isJobDetailPage() {
    return LINKEDIN_JOBS_REGEX.test(window.location.href);
  }

  /** Return all searchable roots (document + accessible iframes). */
  function getSearchRoots() {
    const roots = [document];
    const frames = document.querySelectorAll('iframe');
    for (const frame of frames) {
      try {
        const doc = frame.contentDocument;
        if (doc && !roots.includes(doc)) {
          roots.push(doc);
        }
      } catch {
        // Cross-origin iframe — ignore
      }
    }
    return roots;
  }

  function findFirstMatchingElement(selectors, minLength = 0) {
    for (const root of getSearchRoots()) {
      for (const sel of selectors) {
        try {
          const el = root.querySelector(sel);
          if (!el) continue;
          const text = getText(el);
          if (!minLength || text.length >= minLength) {
            return el;
          }
        } catch { /* invalid selector, skip */ }
      }
    }
    return null;
  }

  async function waitForElement(selectors, minLength = 0, timeout = ELEMENT_WAIT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const match = findFirstMatchingElement(selectors, minLength);
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return findFirstMatchingElement(selectors, minLength);
  }

  function isButtonLike(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'button') return true;
    if (role === 'button') return true;
    // Allow anchor only if explicitly role=button
    if (tag === 'a') return role === 'button';
    return false;
  }

  /** Click the first "See more" / "Show more" in the job description area to expand. */
  function expandSeeMore() {
    let clicked = false;
    for (const root of getSearchRoots()) {
      const candidates = root.querySelectorAll('button, [role="button"]');
      for (const el of candidates) {
        if (!isButtonLike(el)) continue;
        const text = (el.innerText || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        if (SEE_MORE_TEXTS.some(t => text === t || text.startsWith(t) || aria.includes('see more') || aria.includes('show more'))) {
          const parent = el.closest('[class*="jobs-description"], [class*="jobs-details"], [class*="description"], [class*="jobs-box"], #job-details');
          if (parent || root.body.contains(el)) {
            try {
              el.click();
              clicked = true;
            } catch {
              // Ignore click failures
            }
          }
        }
      }
    }
    return clicked;
  }

  /** Get visible text from an element. */
  function getText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').trim();
  }

  function extractTitle() {
    const selectors = [
      // Current LinkedIn selectors (2025+)
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      // Variations
      '.jobs-unified-top-card__job-title a',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__content-title',
      '.t-24.t-bold.inline',
      // Public jobs (logged-out/marketing) selectors
      'h1.top-card-layout__title',
      '.top-card-layout__title',
      '[data-tracking-control-name="public_jobs_topcard-title"]',
      '[data-test-id="job-details-job-title"]',
      '[data-testid="job-details-job-title"]',
      // Data test attributes
      // Top card container h1
      '.jobs-details h1',
      '.jobs-details-top-card h1',
      // Last resort: any h1 in main content
      'main h1',
      'h1',
    ];
    for (const root of getSearchRoots()) {
      for (const sel of selectors) {
        try {
          const el = root.querySelector(sel);
          const text = getText(el);
          if (text.length > 0 && text.length < 200 && !text.includes('\n\n')) {
            return text.split('\n')[0].trim();
          }
        } catch { /* skip invalid selector */ }
      }
    }
    return '';
  }

  function normalizeCompanyText(text) {
    if (!text) return '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const split = cleaned.split(/·|•|\||–|—/);
    return (split[0] || cleaned).trim();
  }

  function extractCompany() {
    const selectors = [
      // Current LinkedIn selectors (2025+)
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__primary-description a',
      '.job-details-jobs-unified-top-card__primary-description',
      '.job-details-jobs-unified-top-card__primary-description-without-company-name a',
      '.job-details-jobs-unified-top-card__primary-description-without-company-name',
      // Older selectors
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__primary-description a',
      '.jobs-unified-top-card__primary-description',
      // Public jobs (logged-out/marketing) selectors
      'a.topcard__org-name-link',
      '.topcard__flavor-row a',
      '.topcard__flavor',
      '[data-tracking-control-name="public_jobs_topcard-org-name"]',
      // Data test
      '[data-test-id="job-details-company-name"]',
      '[data-testid="job-details-company-name"]',
      // Variations
      '.jobs-details-top-card__company-info a',
    ];
    for (const root of getSearchRoots()) {
      for (const sel of selectors) {
        try {
          const el = root.querySelector(sel);
          const text = normalizeCompanyText(getText(el));
          if (text.length > 0 && text.length < 150) return text;
        } catch { /* skip */ }
      }
    }
    return '';
  }

  function parseTitleCompanyFromDocTitle() {
    const raw = (document.title || '').trim();
    if (!raw) return { title: '', company: '' };
    const cleaned = raw.replace(/\s+/g, ' ');
    // Example: "Job Title | Company | LinkedIn"
    const parts = cleaned.split(' | ').map(p => p.trim()).filter(Boolean);
    const liIdx = parts.findIndex(p => /linkedin/i.test(p));
    const trimmed = liIdx >= 0 ? parts.slice(0, liIdx) : parts;
    if (trimmed.length >= 2) {
      return { title: trimmed[0], company: trimmed[1] };
    }
    // Example: "Job Title at Company | LinkedIn"
    const atMatch = cleaned.match(/^(.+?)\s+at\s+(.+?)(\s+\|\s+LinkedIn)?$/i);
    if (atMatch) {
      return { title: atMatch[1].trim(), company: atMatch[2].trim() };
    }
    return { title: '', company: '' };
  }

  async function extractDescription() {
    // All known selectors for job description content, ordered by specificity
    const descriptionSelectors = [
      // The "show more/less" markup (expanded content) — very reliable
      '.show-more-less-html__markup',
      // Job details container and children
      '#job-details > div',
      '#job-details span',
      '#job-details',
      // Description-specific classes
      '.jobs-description-content__text',
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-description__content',
      '.jobs-description-content',
      '.jobs-description',
      '.jobs-box__html-content',
      // Broader fallbacks
      '[class*="jobs-description"] [class*="content"]',
      'article[class*="jobs-description"]',
      '.description__text',
    ];

    // Wait for any of these to appear with content
    const el = await waitForElement(descriptionSelectors, 60);
    if (el) {
      const text = getText(el);
      if (text.length > 50) return text;
    }

    // Immediate check all selectors (in case waitForAnyElement missed due to short text)
    for (const root of getSearchRoots()) {
      for (const sel of descriptionSelectors) {
        try {
          const elements = root.querySelectorAll(sel);
          for (const elem of elements) {
            const text = getText(elem);
            if (text.length > 80) return text;
          }
        } catch { /* skip */ }
      }
    }

    // Fallback: look for an "About the job" heading and grab content after it
    for (const root of getSearchRoots()) {
      const headings = root.querySelectorAll('h2, h3, span, div');
      for (const heading of headings) {
        const hText = getText(heading);
        if (/^(about the job|job description|description)$/i.test(hText)) {
          let next = heading.nextElementSibling;
          while (next) {
            const t = getText(next);
            if (t.length > 80) return t;
            next = next.nextElementSibling;
          }
          if (heading.parentElement) {
            let parentNext = heading.parentElement.nextElementSibling;
            while (parentNext) {
              const t = getText(parentNext);
              if (t.length > 80) return t;
              parentNext = parentNext.nextElementSibling;
            }
          }
        }
      }
    }

    return '';
  }

  async function extractJobDescription() {
    if (!isJobDetailPage()) {
      return { ok: false, error: 'Not on a LinkedIn job detail page.' };
    }

    // Try expanding "See more" before extracting
    const clicked = expandSeeMore();
    if (clicked) {
      await new Promise(r => setTimeout(r, EXPAND_WAIT_MS));
    }

    let title = extractTitle();
    let company = extractCompany();
    if (!title || !company) {
      const fallback = parseTitleCompanyFromDocTitle();
      if (!title && fallback.title) title = fallback.title;
      if (!company && fallback.company) company = fallback.company;
    }
    const description = await extractDescription();

    if (!title && !company && !description) {
      return { ok: false, error: 'Could not find job details on this page. Try scrolling to the job description and try again.' };
    }

    // Clean up description: strip LinkedIn boilerplate headers and excess whitespace
    const cleanDesc = (description || '')
      .replace(/^[\s\n\r]+/, '')
      .replace(/^About the job[\s\n\r]*/i, '')
      .replace(/^About this role[\s\n\r]*/i, '')
      .replace(/^Job [Dd]escription[\s\n\r]*/i, '')
      .replace(/^Description[\s\n\r]*/i, '')
      .replace(/^Overview[\s\n\r]*/i, '')
      .replace(/^[\s\n\r]+/, '')
      .replace(/[\s\n\r]+$/, '')
      .replace(/\n{3,}/g, '\n\n');

    return {
      ok: true,
      title: title || '(No title found)',
      company: company || '(No company found)',
      description: cleanDesc || '(No description found)',
      url: window.location.href,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'GET_JOB_DESCRIPTION') {
      extractJobDescription().then(sendResponse);
      return true; // keep channel open for async response
    }
  });
})();
