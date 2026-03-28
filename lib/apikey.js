/**
 * Shared API key resolution for OpenAI.
 * Priority: chrome.storage.local (user-provided) → lib/config.js (hardcoded fallback).
 */

import { OPENAI_API_KEY } from './config.js';

const STORAGE_KEY = 'openaiApiKey';

export async function getApiKey() {
  // Try chrome.storage first
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      if (data?.[STORAGE_KEY] && data[STORAGE_KEY].trim()) {
        return data[STORAGE_KEY].trim();
      }
    }
  } catch {
    // not running in extension context - ignore
  }

  if (OPENAI_API_KEY && OPENAI_API_KEY.trim()) {
    return OPENAI_API_KEY.trim();
  }

  throw new Error('No OpenAI API key found. Open Settings and add your key.');
}
