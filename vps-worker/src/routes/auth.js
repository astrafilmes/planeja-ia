import { m2a } from "../m2a-client.js";

export async function authRoutes(app) {
  app.post("/auth/refresh", async () => {
    m2a.loggedIn = false;
    await m2a.login();
    return { ok: true, ...m2a.status() };
  });

  app.get("/auth/status", async () => m2a.status());
}
