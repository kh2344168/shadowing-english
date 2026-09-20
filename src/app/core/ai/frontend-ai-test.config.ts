type ShadowingServerConfig = {
  groqApiKey?: string;
  groqModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  mistralApiKey?: string;
  mistralModel?: string;
  pexelsApiKey?: string;
};

function runtimeConfig(): ShadowingServerConfig {
  if (typeof window === 'undefined') return {};
  return ((window as typeof window & { shadowingServerConfig?: ShadowingServerConfig })
    .shadowingServerConfig || {});
}

const cfg = runtimeConfig();

/**
 * LOCAL TESTING ONLY.
 *
 * These values come from public/server-config.js and are intentionally visible
 * in DevTools for this private test build.
 */
export const FRONTEND_AI_TEST_CONFIG = {
  enabled: true,
  groqApiKey: (cfg.groqApiKey || '').trim(),
  groqModel: (cfg.groqModel || 'openai/gpt-oss-120b').trim(),
  geminiApiKey: (cfg.geminiApiKey || '').trim(),
  geminiModel: (cfg.geminiModel || 'gemini-3.1-flash-lite').trim(),
  mistralApiKey: (cfg.mistralApiKey || '').trim(),
  mistralModel: (cfg.mistralModel || 'mistral-small-latest').trim(),
  pexelsApiKey: (cfg.pexelsApiKey || '').trim(),
} as const;
