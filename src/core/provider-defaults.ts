export const DEFAULTS = {
  primary: {
    provider: "freellmapi",
    model: "auto",
    baseURL: "http://localhost:3001/v1",
    apiKey: "", // Set via FREELLMAPI_KEY env var
  },
  fallback: {
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "", // Set via OPENROUTER_KEY env var
  },
} as const
