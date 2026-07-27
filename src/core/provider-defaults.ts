export const DEFAULTS = {
  primary: {
    provider: "freellmapi",
    model: "auto",
    baseURL: "http://localhost:3001/v1",
    apiKey: "",
  },
  fallback: {
    provider: "openrouter",
    model: "deepseek/deepseek-v4-pro",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "",
  },
} as const
