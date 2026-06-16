import "dotenv/config";

const M2A_ENTITY_LOGIN_PATH = "/usuario/login/";
const M2A_ENTITY_LOGIN_PROFILE = "1";

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return v.trim();
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  logLevel: process.env.LOG_LEVEL ?? "info",

  m2a: {
    baseUrl: required("M2A_BASE_URL").replace(/\/+$/, ""),
    username: required("M2A_USERNAME"),
    password: required("M2A_PASSWORD"),
    // Login é sempre no portal da entidade/órgão público.
    // Não lemos mais M2A_LOGIN_PATH/M2A_LOGIN_PROFILE do .env para evitar
    // cair acidentalmente no portal de fornecedores por variável antiga do PM2.
    loginPath: M2A_ENTITY_LOGIN_PATH,
    loginProfile: M2A_ENTITY_LOGIN_PROFILE,
    maxConcurrency: Number(process.env.M2A_MAX_CONCURRENCY ?? 2),
  },

  gemini: {
    apiKey: (process.env.GEMINI_API_KEY ?? "").trim() || null,
  },

  sharedSecret: required("SHARED_SECRET"),
};

