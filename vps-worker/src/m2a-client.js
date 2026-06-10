import axios from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import PQueue from "p-queue";
import * as cheerio from "cheerio";
import { config } from "./config.js";

/**
 * Cliente HTTP único contra o M2A.
 * - 1 sessão (conta de serviço) compartilhada por todo o worker.
 * - Faz login sob demanda e revalida automaticamente se a sessão expirar.
 * - Serializa requests via p-queue para não derrubar o portal.
 */
class M2aClient {
  constructor() {
    this.jar = new CookieJar();
    this.http = wrapper(
      axios.create({
        baseURL: config.m2a.baseUrl,
        jar: this.jar,
        withCredentials: true,
        timeout: 60_000,
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
        headers: {
          "User-Agent":
            "Planeja-M2A-Worker/0.1 (+https://planeja-ia.lovable.app)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      }),
    );
    this.queue = new PQueue({ concurrency: config.m2a.maxConcurrency });
    this.loggedIn = false;
    this.loginPromise = null;
    this.lastLoginAt = 0;
  }

  /** Detecta página de login pelo HTML retornado. */
  static isLoginPage(html, finalUrl = "") {
    if (!html) return false;
    if (/\/login\//i.test(finalUrl)) return true;
    return /name=["']password["']/i.test(html);
  }

  /** Faz login. Idempotente: se outra chamada estiver autenticando, espera. */
  async login() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      // 1) GET na página de login para coletar CSRF + cookies iniciais.
      const getRes = await this.http.get(config.m2a.loginPath);
      const $ = cheerio.load(getRes.data || "");
      const csrf =
        $('input[name="csrfmiddlewaretoken"]').attr("value") ||
        $('input[name="_token"]').attr("value") ||
        "";

      const form = new URLSearchParams();
      form.set("username", config.m2a.username);
      form.set("password", config.m2a.password);
      if (csrf) {
        form.set("csrfmiddlewaretoken", csrf);
        form.set("_token", csrf);
      }

      const postRes = await this.http.post(config.m2a.loginPath, form, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${config.m2a.baseUrl}${config.m2a.loginPath}`,
          "X-CSRFToken": csrf || undefined,
        },
      });

      const html = String(postRes.data || "");
      const finalUrl = postRes.request?.res?.responseUrl || "";
      if (M2aClient.isLoginPage(html, finalUrl)) {
        throw new Error("M2A_LOGIN_FAILED");
      }
      this.loggedIn = true;
      this.lastLoginAt = Date.now();
    })().finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }

  /**
   * GET com auto-relogin caso a sessão tenha expirado.
   * Retorna { status, html, finalUrl }.
   */
  async get(path) {
    return this.queue.add(async () => {
      if (!this.loggedIn) await this.login();
      let res = await this.http.get(path);
      let html = typeof res.data === "string" ? res.data : "";
      let finalUrl = res.request?.res?.responseUrl || "";

      if (M2aClient.isLoginPage(html, finalUrl) || res.status === 401 || res.status === 403) {
        this.loggedIn = false;
        await this.login();
        res = await this.http.get(path);
        html = typeof res.data === "string" ? res.data : "";
        finalUrl = res.request?.res?.responseUrl || "";
        if (M2aClient.isLoginPage(html, finalUrl)) {
          throw new Error("M2A_SESSION_REFRESH_FAILED");
        }
      }
      return { status: res.status, html, finalUrl };
    });
  }

  status() {
    return {
      loggedIn: this.loggedIn,
      lastLoginAt: this.lastLoginAt || null,
      pending: this.queue.pending,
      size: this.queue.size,
    };
  }
}

export const m2a = new M2aClient();
