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
 * - Mantém cache de CSRF por URL (espelha rememberCsrfFromDoc do engine).
 */

const CSRF_TTL_MS = 10 * 60 * 1000;

function absoluteUrl(path) {
  return path.startsWith("http") ? path : `${config.m2a.baseUrl}${path}`;
}

function normalizeCacheUrl(url) {
  return absoluteUrl(url).replace(/#.*$/, "");
}

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
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      }),
    );
    this.queue = new PQueue({ concurrency: config.m2a.maxConcurrency });
    this.loggedIn = false;
    this.loginPromise = null;
    this.lastLoginAt = 0;
    this.sessionCsrf = null;
    this.csrfCache = new Map();
  }

  resetSession() {
    this.jar = new CookieJar();
    this.http.defaults.jar = this.jar;
    this.loggedIn = false;
    this.sessionCsrf = null;
    this.csrfCache.clear();
  }

  static isLoginPage(html, finalUrl = "") {
    if (!html) return false;
    if (/(?:\/login\/|\/usuario\/login\/)/i.test(finalUrl)) return true;
    return /name=["']password["']/i.test(html);
  }

  rememberCsrf(html, sourceUrl) {
    if (!html) return null;
    const m = String(html).match(
      /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/i,
    );
    if (!m) return null;
    const token = m[1];
    this.sessionCsrf = token;
    if (sourceUrl) {
      this.csrfCache.set(normalizeCacheUrl(sourceUrl), {
        token,
        at: Date.now(),
      });
    }
    return token;
  }

  async login() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      this.resetSession();
      const loginUrl = `${config.m2a.baseUrl}${config.m2a.loginPath}`;
      console.log(`[m2a-login] start ENTIDADE user=${config.m2a.username} url=${loginUrl} perfil=${config.m2a.loginProfile}`);
      let getRes;
      try {
        getRes = await this.http.get(config.m2a.loginPath);
      } catch (err) {
        console.error(`[m2a-login] GET form falhou: ${err.message}`);
        throw new Error(`M2A_LOGIN_FAILED: GET ${config.m2a.loginPath} → ${err.message}`);
      }
      const getFinalUrl = getRes.request?.res?.responseUrl || "";
      console.log(`[m2a-login] GET status=${getRes.status} finalUrl=${getFinalUrl} bytes=${(getRes.data || "").length}`);

      const $ = cheerio.load(getRes.data || "");
      const csrf =
        $('input[name="csrfmiddlewaretoken"]').attr("value") ||
        $('input[name="_token"]').attr("value") ||
        "";
      const profileOptions = $('input[name="perfil"]')
        .map((_, el) => {
          const value = $(el).attr("value") || "";
          const label = $(el).closest("label").text().replace(/\s+/g, " ").trim();
          const checked = $(el).is("[checked]") ? " checked" : "";
          return `${value}:${label || "sem label"}${checked}`;
        })
        .get()
        .join(" | ");
      console.log(`[m2a-login] csrf ${csrf ? `presente(len=${csrf.length})` : "AUSENTE"}`);
      console.log(`[m2a-login] perfis no form: ${profileOptions || "(nenhum)"}; enviando perfil=${config.m2a.loginProfile}`);
      const cookieStr = await this.jar.getCookieString(config.m2a.baseUrl);
      console.log(`[m2a-login] cookies pré-POST: ${cookieStr || "(vazio)"}`);

      const form = new URLSearchParams();
      if (csrf) {
        form.set("csrfmiddlewaretoken", csrf);
      }
      form.set("perfil", config.m2a.loginProfile);
      form.set("username", config.m2a.username);
      form.set("password", config.m2a.password);
      form.set("login-form", "");
      console.log(`[m2a-login] POST payload: perfil=${form.get("perfil")} username=${form.get("username")} password=(oculta) csrf=${csrf ? "sim" : "não"} login-form=sim`);

      let postRes;
      try {
        postRes = await this.http.post(config.m2a.loginPath, form, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "max-age=0",
            "Upgrade-Insecure-Requests": "1",
            Origin: config.m2a.baseUrl,
            Referer: loginUrl,
          },
        });
      } catch (err) {
        console.error(`[m2a-login] POST falhou: ${err.message}`);
        throw new Error(`M2A_LOGIN_FAILED: POST ${config.m2a.loginPath} → ${err.message}`);
      }

      const html = String(postRes.data || "");
      const finalUrl = postRes.request?.res?.responseUrl || "";
      const cookieAfter = await this.jar.getCookieString(config.m2a.baseUrl);
      console.log(`[m2a-login] POST status=${postRes.status} finalUrl=${finalUrl} bytes=${html.length}`);
      console.log(`[m2a-login] cookies pós-POST: ${cookieAfter || "(vazio)"}`);

      if (M2aClient.isLoginPage(html, finalUrl)) {
        // Extrai mensagem de erro do form (Django costuma renderizar em .errorlist / .alert)
        const $$ = cheerio.load(html);
        const errMsg =
          $$(".errorlist").first().text().trim() ||
          $$(".alert").first().text().trim() ||
          $$(".help-block").first().text().trim() ||
          "";
        console.error(`[m2a-login] FALHOU — ainda na página de login. perfil=${config.m2a.loginProfile} finalUrl=${finalUrl} msg="${errMsg}"`);
        if (/portal de fornecedores/i.test(errMsg)) {
          console.error(`[m2a-login] diagnóstico: o worker atual força /usuario/login/ com perfil=1. Se este log não mostra "start ENTIDADE" ou "perfil=1", a VPS ainda está rodando código antigo; faça git pull, npm install e pm2 restart planeja-m2a-worker --update-env.`);
        }
        const snippet = html.replace(/\s+/g, " ").slice(0, 400);
        console.error(`[m2a-login] snippet: ${snippet}`);
        throw new Error(
          `M2A_LOGIN_FAILED${errMsg ? `: ${errMsg}` : ""} (status=${postRes.status}, finalUrl=${finalUrl})`,
        );
      }
      console.log(`[m2a-login] OK — sessão estabelecida`);
      this.loggedIn = true;
      this.lastLoginAt = Date.now();
      this.sessionCsrf = null;
      this.csrfCache.clear();
    })().finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }


  async _raw(method, path, opts = {}) {
    const binary = opts.responseType === "arraybuffer";
    const headers = {
      Accept: binary
        ? "application/pdf,application/octet-stream,*/*"
        : "text/html,application/json,*/*",
      ...(opts.headers || {}),
    };
    const cfg = {
      method,
      url: path,
      headers,
      responseType: binary ? "arraybuffer" : "text",
      transformResponse: [(data) => data],
    };
    if (opts.body !== undefined) cfg.data = opts.body;
    const res = await this.http.request(cfg);
    const finalUrl = res.request?.res?.responseUrl || "";
    const contentType = res.headers?.["content-type"] || "";
    const contentDisposition = res.headers?.["content-disposition"] || null;
    if (binary) {
      const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data);
      // Detecta página de login (HTML) mesmo quando pedimos binário.
      const looksHtml =
        contentType.toLowerCase().includes("text/html") ||
        (buf.length < 64_000 && /<html/i.test(buf.toString("utf8", 0, Math.min(buf.length, 2048))));
      const html = looksHtml ? buf.toString("utf8") : "";
      return {
        status: res.status,
        html,
        bytes: buf,
        finalUrl,
        contentType,
        contentDisposition,
        raw: res,
      };
    }
    const text =
      typeof res.data === "string"
        ? res.data
        : res.data == null
          ? ""
          : JSON.stringify(res.data);
    return { status: res.status, html: text, finalUrl, contentType, contentDisposition, raw: res };
  }

  /** request com auto-relogin. Aceita method/path/body/headers. */
  async request(method, path, opts = {}) {
    return this.queue.add(async () => {
      if (!this.loggedIn) {
        console.log(`[m2a] sessão ausente — efetuando login antes de ${method} ${path}`);
        await this.login();
      }
      let r = await this._raw(method, path, opts);
      console.log(`[m2a] ${method} ${path} → ${r.status} (finalUrl=${r.finalUrl || "-"}, bytes=${r.html.length})`);
      if (
        M2aClient.isLoginPage(r.html, r.finalUrl) ||
        r.status === 401 ||
        r.status === 403
      ) {
        console.warn(`[m2a] sessão expirada em ${method} ${path} — re-login e retry`);
        this.loggedIn = false;
        await this.login();
        r = await this._raw(method, path, opts);
        console.log(`[m2a] retry ${method} ${path} → ${r.status} (finalUrl=${r.finalUrl || "-"})`);
        if (M2aClient.isLoginPage(r.html, r.finalUrl)) {
          throw new Error("M2A_SESSION_REFRESH_FAILED");
        }
      }
      // Remember CSRF when present
      this.rememberCsrf(r.html, path);
      return r;
    });
  }


  get(path, opts = {}) {
    return this.request("GET", path, opts);
  }

  postForm(path, payload, opts = {}) {
    const body =
      payload instanceof URLSearchParams
        ? payload.toString()
        : new URLSearchParams(payload).toString();
    return this.request("POST", path, {
      ...opts,
      body,
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        ...(opts.headers || {}),
      },
    });
  }

  /** POST multipart/form-data. payload = FormData (node form-data). */
  async postMultipart(path, formData, opts = {}) {
    return this.request("POST", path, {
      ...opts,
      body: formData,
      headers: {
        ...formData.getHeaders(),
        "X-Requested-With": "XMLHttpRequest",
        ...(opts.headers || {}),
      },
    });
  }

  /** Captura/retorna CSRF para a URL dada (com cache). */
  async getCsrf(path, opts = {}) {
    const key = normalizeCacheUrl(path);
    const cached = this.csrfCache.get(key);
    if (!opts.force && cached && Date.now() - cached.at < CSRF_TTL_MS) {
      return cached.token;
    }
    if (!opts.force && this.sessionCsrf) return this.sessionCsrf;
    const r = await this.request("GET", path, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const token = this.rememberCsrf(r.html, path);
    if (!token) throw new Error(`CSRF ausente em ${path}`);
    return token;
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
