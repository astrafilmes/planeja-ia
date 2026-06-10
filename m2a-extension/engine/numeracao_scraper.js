// numeracao_scraper.js — executa no MAIN world da aba do portal M2A.
// Para cada secretaria, busca a página de listagem de contratos e
// extrai o maior número de contrato já criado no ano informado.
//
// Padrão esperado de número de contrato: NNN/AAAA<SIGLA>  (ex: 045/2025SECAD)
//
// AJUSTE a constante LIST_URL_TEMPLATE conforme o endpoint real do portal.
// O scraper é tolerante: se a página não retornar HTML conhecido, devolve
// ultimo_numero=null com o erro encontrado.

(function () {
  if (window.__M2A_NUM_SCRAPER_LOADED__) return;
  window.__M2A_NUM_SCRAPER_LOADED__ = true;

  // Template — { sigla, ano } são substituídos.
  // Ex.: "/contratacao/contratos/?secretaria=SECAD&ano=2025"
  const LIST_URL_TEMPLATE =
    "/contratacao/contratos/?secretaria={sigla}&ano={ano}";

  function isLoginPage(html) {
    return (
      /name=["']password["']/i.test(html) ||
      /\/login\//i.test(location.pathname)
    );
  }

  async function fetchHtml(url) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "text/html, */*",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    return {
      ok: res.ok,
      status: res.status,
      text: await res.text(),
      url: res.url,
    };
  }

  // Extrai maior NNN do padrão NNN/AAAA<SIGLA> dentro do HTML.
  function extractMaxNumero(html, sigla, ano) {
    const re = new RegExp(`(\\d{1,4})\\s*/\\s*${ano}\\s*${sigla}`, "gi");
    let max = 0;
    let found = false;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) {
        found = true;
        if (n > max) max = n;
      }
    }
    return found ? max : null;
  }

  async function scrapeOne({ sigla, num }, ano) {
    console.log(`[M2A NumScraper] Iniciando busca para ${sigla} em ${ano}...`);
    try {
      const url = LIST_URL_TEMPLATE.replace(
        "{sigla}",
        encodeURIComponent(sigla),
      ).replace("{ano}", String(ano));
      const r = await fetchHtml(url);
      if (!r.ok) {
        console.error(
          `[M2A NumScraper] Erro HTTP ao buscar ${sigla}:`,
          r.status,
        );
        return { sigla, num, ultimo_numero: null, erro: `HTTP ${r.status}` };
      }
      if (isLoginPage(r.text)) {
        console.warn(`[M2A NumScraper] Sessão expirada para ${sigla}.`);
        return { sigla, num, ultimo_numero: null, erro: "nao_logado" };
      }
      const ultimo = extractMaxNumero(r.text, sigla, ano);
      console.log(`[M2A NumScraper] Resultado para ${sigla}:`, ultimo);
      return { sigla, num, ultimo_numero: ultimo, ano };
    } catch (e) {
      console.error(`[M2A NumScraper] Falha na execução para ${sigla}:`, e);
      return { sigla, num, ultimo_numero: null, erro: String(e?.message ?? e) };
    }
  }

  async function run({ requestId, secretarias, ano }) {
    console.group(`[M2A NumScraper] Sincronização numeracao para ano ${ano}`);
    console.time("TotalNumeracaoScrape");
    const itens = [];
    for (const s of secretarias) {
      // sequencial para evitar rate-limit do portal

      const r = await scrapeOne(s, ano);
      itens.push(r);
      window.postMessage(
        { type: "M2A_SYNC_PROGRESS", requestId, sigla: s.sigla, resultado: r },
        location.origin,
      );
    }
    window.postMessage(
      { type: "M2A_SYNC_RESULT", requestId, itens },
      location.origin,
    );
  }

  window.addEventListener("M2A_SYNC_RUN", (ev) => {
    const payload = ev.detail || {};
    run(payload).catch((e) => {
      window.postMessage(
        {
          type: "M2A_SYNC_RESULT",
          requestId: payload.requestId,
          itens: [],
          erro: String(e?.message ?? e),
        },
        location.origin,
      );
    });
  });
})();
