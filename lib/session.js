export const SESSION_STORAGE_KEY = 'omniSessionState';

export const DEFAULT_SESSION_STATE = {
  job: null,
  tailoring: {
    status: 'idle', // idle | running | success | error
    mode: 'conservative',
    startedAt: null,
    finishedAt: null,
    error: null,
    requestId: null,
  },
  lastMode: 'conservative',
  template: 'classic',
  statusMessage: '',
  statusIsError: false,
  step: 1,
};

export function mergeSessionState(base = DEFAULT_SESSION_STATE, patch = {}) {
  return {
    ...base,
    ...patch,
    tailoring: {
      ...base.tailoring,
      ...(patch.tailoring || {}),
    },
  };
}
