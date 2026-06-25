// =====================================================================
// Geração de Justificativa da Demanda via a IA NATIVA do M2A (MIA!).
// Endpoint: /gestao_compras/formalizacao_demanda/gerar_conteudo_justificativa/{dfdId}/
//
// Resposta: JSON { html_form: "...<textarea name=\"justificativa_demanda\">TEXTO</textarea>..." }
// onde TEXTO vem HTML-encoded com parágrafos iniciando por "1.", "2.", etc.,
// separados por \n. Convertemos para o formato salvo pelo Summernote:
//   <div style="text-align: justify;">P1<br><br>P2<br><br>...<br><br>Pn</div>
// =====================================================================
import { m2a } from "../m2a-client.js";
import { config } from "../config.js";

const PROMPT_PADRAO =
  "Por favor, expanda de forma abrangente a descrição, elaborando um texto no formato dissertativo argumentativo, contendo um mínimo de 5 parágrafos, iniciando cada um com o numero que representa cada paragrafo, ex: 1, bem estruturados por etapa (Introdução, 1 parágrafo - Desenvolvimento, 3 parágrafos - Conclusão, 1 parágrafo), para justificar esta demanda.\n";

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extrairTextareaJustificativa(htmlForm) {
  const html = String(htmlForm || "");
  // textarea pode aparecer com atributos em ordem variável; busca pelo name.
  const m = html.match(
    /<textarea[^>]*name=["']justificativa_demanda["'][^>]*>([\s\S]*?)<\/textarea>/i,
  );
  if (!m) return "";
  return decodeHtmlEntities(m[1]).trim();
}

function limparEnvelopeDiv(texto) {
  // Remove um eventual <div ...>...</div> externo que a IA do M2A já retorna.
  const m = texto.match(/^<div[^>]*>([\s\S]*)<\/div>\s*$/i);
  return m ? m[1].trim() : texto.trim();
}

function paragrafosDoTextoNumerado(texto) {
  const limpo = limparEnvelopeDiv(texto)
    .replace(/\r\n/g, "\n")
    // remove <br> isolados — vamos reconstruir
    .replace(/<br\s*\/?>(\s*<br\s*\/?>)?/gi, "\n")
    .trim();

  // Estratégia: parágrafos começam com "N." ou "N)" no início de linha.
  // Caso não haja numeração, separa por linhas em branco / \n.
  const re = /(^|\n)\s*\d+\s*[\.\)]\s*/g;
  if (re.test(limpo)) {
    return limpo
      .split(/(?:^|\n)\s*\d+\s*[\.\)]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return limpo
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function montarHtmlJustificativaDoTextoM2A(texto) {
  const paragrafos = paragrafosDoTextoNumerado(texto);
  if (!paragrafos.length) return "";
  return `<div style="text-align: justify;">${paragrafos.join("<br><br>")}</div>`;
}

/**
 * Chama a IA nativa do M2A para gerar a justificativa e retorna o HTML
 * já formatado (pronto para o atualizar_justificativa).
 * Lança erro em qualquer falha — o orquestrador decide o fallback.
 */
async function lerJustificativaDaPaginaDFD(dfdId) {
  const r = await m2a.get(`/gestao_compras/formalizacao_demanda/${dfdId}/`);
  if (r.status >= 400) return "";
  // procura o textarea de justificativa OU o div já renderizado dentro do summernote
  const html = String(r.html || "");
  const ta = html.match(
    /<textarea[^>]*name=["']justificativa_demanda["'][^>]*>([\s\S]*?)<\/textarea>/i,
  );
  if (ta) {
    const txt = decodeHtmlEntities(ta[1]).trim();
    if (txt && txt.length > 20) return txt;
  }
  // fallback: bloco renderizado com o conteúdo da IA
  const m = html.match(
    /id=["']justificativa_demanda["'][^>]*>([\s\S]{40,}?)<\/(?:div|section|p)>/i,
  );
  if (m) return decodeHtmlEntities(m[1]).trim();
  return "";
}

export async function gerarJustificativaM2A(
  dfdId,
  {
    prompt,
    timeoutMs = 300_000,
    tentativas = 2,
    signal,
    pollMs = 5_000,
    pollMaxMs = 240_000,
  } = {},
) {
  if (!dfdId) throw new Error("gerarJustificativaM2A: dfdId obrigatório");
  const path = `/gestao_compras/formalizacao_demanda/gerar_conteudo_justificativa/${dfdId}/`;
  const formPath = `/gestao_compras/formalizacao_demanda/${dfdId}/`;

  let ultimoErro = null;
  for (let attempt = 1; attempt <= tentativas; attempt++) {
    if (signal?.aborted) throw new Error("Operação cancelada pelo usuário.");
    let csrf;
    try {
      csrf = await m2a.getCsrf(formPath, attempt > 1 ? { force: true } : {});
    } catch {
      csrf = await m2a.getCsrf("/", attempt > 1 ? { force: true } : {});
    }

    const body = new URLSearchParams({
      csrfmiddlewaretoken: csrf,
      prompt: prompt || PROMPT_PADRAO,
    });

    const t0 = Date.now();
    console.log(
      `[m2a-ia] DFD ${dfdId}: chamando IA nativa (tentativa ${attempt}/${tentativas}, timeout=${Math.round(timeoutMs / 1000)}s) — aguardando resposta…`,
    );
    let r;
    try {
      r = await m2a.postForm(path, body, {
        timeout: timeoutMs,
        headers: {
          Referer: `${config.m2a.baseUrl}${formPath}`,
          Origin: config.m2a.baseUrl,
          Accept: "*/*",
        },
      });
    } catch (err) {
      ultimoErro = err;
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      console.warn(
        `[m2a-ia] DFD ${dfdId} tentativa ${attempt} falhou após ${dur}s: ${err?.message || err}`,
      );
      continue;
    }
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.status >= 400) {
      ultimoErro = new Error(`status=${r.status}`);
      console.warn(
        `[m2a-ia] DFD ${dfdId} tentativa ${attempt}: HTTP ${r.status} após ${dur}s`,
      );
      continue;
    }

    // 1) Tenta extrair direto da resposta (caso síncrona).
    let texto = "";
    let data = null;
    try {
      data = typeof r.html === "string" ? JSON.parse(r.html) : r.html;
      const htmlForm = data?.html_form || data?.htmlForm || "";
      texto = extrairTextareaJustificativa(htmlForm);
    } catch {
      // resposta não-JSON — pode ser ack
    }
    const rawPreview = String(r.html || "").slice(0, 200).replace(/\s+/g, " ");
    console.log(
      `[m2a-ia] DFD ${dfdId} resposta POST após ${dur}s (${String(r.html || "").length} bytes): ${rawPreview}`,
    );

    // 2) Se vazio, faz polling na página da DFD (a IA processa em background).
    if (!texto) {
      console.log(
        `[m2a-ia] DFD ${dfdId} tentativa ${attempt}: resposta vazia/ack — iniciando polling (até ${Math.round(pollMaxMs / 1000)}s)…`,
      );
      const pollStart = Date.now();
      while (Date.now() - pollStart < pollMaxMs) {
        if (signal?.aborted) throw new Error("Operação cancelada pelo usuário.");
        await new Promise((res) => setTimeout(res, pollMs));
        try {
          const t = await lerJustificativaDaPaginaDFD(dfdId);
          if (t && t.length > 20) {
            texto = t;
            const wait = ((Date.now() - pollStart) / 1000).toFixed(1);
            console.log(
              `[m2a-ia] DFD ${dfdId}: justificativa apareceu após ${wait}s de polling (${t.length} chars)`,
            );
            break;
          }
        } catch (e) {
          console.warn(
            `[m2a-ia] DFD ${dfdId} polling: ${e?.message || e}`,
          );
        }
      }
    }

    if (!texto) {
      ultimoErro = new Error("textarea vazia após polling");
      console.warn(
        `[m2a-ia] DFD ${dfdId} tentativa ${attempt}: sem conteúdo após polling`,
      );
      continue;
    }

    const html = montarHtmlJustificativaDoTextoM2A(texto);
    if (!html) {
      ultimoErro = new Error("parágrafos vazios");
      continue;
    }
    const total = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[m2a-ia] DFD ${dfdId}: IA respondeu em ${total}s (${html.length} chars, tentativa ${attempt})`,
    );
    return html;
  }
  throw new Error(
    `gerar_conteudo_justificativa esgotou ${tentativas} tentativas: ${ultimoErro?.message || ultimoErro}`,
  );
}

