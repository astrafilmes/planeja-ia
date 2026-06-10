import "dotenv/config";

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
    loginPath: process.env.M2A_LOGIN_PATH ?? "/login/",
    maxConcurrency: Number(process.env.M2A_MAX_CONCURRENCY ?? 2),
  },

  sharedSecret: required("SHARED_SECRET"),
};
