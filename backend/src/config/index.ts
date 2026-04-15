export const config = {
  apiPort: parseInt(process.env.API_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
  },

  // Local OpenAI-compatible LLM (LM Studio, Ollama, llama.cpp server…).
  // Defaults target LM Studio on macOS Docker: host.docker.internal:1234.
  // Override with LMSTUDIO_BASE_URL / LMSTUDIO_MODEL / LMSTUDIO_API_KEY.
  lmstudio: {
    baseUrl: process.env.LMSTUDIO_BASE_URL || 'http://host.docker.internal:1234/v1',
    model: process.env.LMSTUDIO_MODEL || '',
    apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/calendar/oauth/callback',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};
