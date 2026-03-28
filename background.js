import { tailorResume, generateWizardDebugReport } from './lib/tailor.js';
import { DEFAULT_SESSION_STATE, SESSION_STORAGE_KEY, mergeSessionState } from './lib/session.js';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[CHARIS] Extension installed', details.reason);
});

async function getSessionState() {
  const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  return mergeSessionState(DEFAULT_SESSION_STATE, stored[SESSION_STORAGE_KEY] || {});
}

async function setSessionState(nextState) {
  await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: nextState });
  return nextState;
}

async function updateSessionState(patchOrUpdater) {
  const current = await getSessionState();
  const next = typeof patchOrUpdater === 'function'
    ? patchOrUpdater(current) || current
    : mergeSessionState(current, patchOrUpdater);
  await setSessionState(next);
  return next;
}

function safeSendStatus(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No popup listening — that's ok.
  });
}

async function handleTailorRequest(payload) {
  const {
    rawText,
    metrics,
    jobTitle,
    jobCompany,
    jobDescription,
    mode,
    requestId,
    refineInstruction,
  } = payload;

  if (!requestId) {
    throw new Error('Missing request id.');
  }

  await updateSessionState((state) => ({
    ...state,
    job: {
      title: jobTitle,
      company: jobCompany,
      description: jobDescription,
      capturedAt: Date.now(),
    },
    tailoring: {
      status: 'running',
      mode,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      requestId,
    },
    step: 3,
  }));

  try {
    const result = await tailorResume({
      rawText,
      metrics,
      jobTitle,
      jobCompany,
      jobDescription,
      mode,
      refineInstruction,
    });

    const currentState = await getSessionState();
    if (currentState.tailoring.requestId !== requestId) {
      console.log('[CHARIS] Tailor result ignored (request no longer active).');
      return;
    }

    await chrome.storage.local.set({ tailoredResume: result });

    await updateSessionState((state) => {
      if (state.tailoring.requestId !== requestId) return state;
      return {
        ...state,
        tailoring: {
          ...state.tailoring,
          status: 'success',
          finishedAt: Date.now(),
        },
        step: 4,
      };
    });

    if (mode === 'wizard') {
      try {
        const report = await generateWizardDebugReport({
          rawText,
          jobTitle,
          jobCompany,
          jobDescription,
          tailoredResume: result,
        });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `omni_debug/wizard_debug_${timestamp}.txt`;
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({ url, filename, saveAs: false });
        setTimeout(() => URL.revokeObjectURL(url), 5_000);
      } catch (debugErr) {
        console.warn('[CHARIS] Debug report failed:', debugErr);
      }
    }

    safeSendStatus({ type: 'TAILOR_STATUS', status: 'success' });
  } catch (err) {
    console.error('[CHARIS] Tailor error (bg):', err);
    const currentState = await getSessionState();
    if (currentState.tailoring.requestId !== requestId) {
      return;
    }
    await updateSessionState((state) => {
      if (state.tailoring.requestId !== requestId) return state;
      return {
        ...state,
        tailoring: {
          ...state.tailoring,
          status: 'error',
          error: err?.message || 'Failed to tailor resume.',
          finishedAt: Date.now(),
        },
      };
    });
    safeSendStatus({ type: 'TAILOR_STATUS', status: 'error', error: err?.message });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'START_TAILORING') {
    handleTailorRequest(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[CHARIS] Failed to start tailoring:', err);
        sendResponse({ ok: false, error: err?.message || 'Failed to start tailoring.' });
      });
    return true; // async response
  }
  if (message?.type === 'RESET_SESSION') {
    setSessionState(DEFAULT_SESSION_STATE).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
