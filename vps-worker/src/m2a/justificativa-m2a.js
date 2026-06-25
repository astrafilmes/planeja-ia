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
export async function gerarJustificativaM2A(dfdId, { prompt } = {}) {
  if (!dfdId) throw new Error("gerarJustificativaM2A: dfdId obrigatório");
  const path = `/gestao_compras/formalizacao_demanda/gerar_conteudo_justificativa/${dfdId}/`;
  const formPath = `/gestao_compras/formalizacao_demanda/${dfdId}/`;

  let csrf;
  try {
    csrf = await m2a.getCsrf(formPath);
  } catch {
    csrf = await m2a.getCsrf("/");
  }

  const body = new URLSearchParams({
    csrfmiddlewaretoken: csrf,
    prompt: prompt || PROMPT_PADRAO,
  });

  const r = await m2a.postForm(path, body, {
    headers: {
      Referer: `${config.m2a.baseUrl}${formPath}`,
      Origin: config.m2a.baseUrl,
      Accept: "*/*",
    },
  });
  if (r.status >= 400) {
    throw new Error(
      `gerar_conteudo_justificativa falhou (status=${r.status})`,
    );
  }
  let data;
  try {
    data = typeof r.html === "string" ? JSON.parse(r.html) : r.html;
  } catch {
    throw new Error(
      `gerar_conteudo_justificativa: resposta não-JSON (status=${r.status})`,
    );
  }
  const htmlForm = data?.html_form || data?.htmlForm || "";
  const texto = extrairTextareaJustificativa(htmlForm);
  if (!texto) {
    throw new Error("gerar_conteudo_justificativa: textarea vazia/ausente.");
  }
  const html = montarHtmlJustificativaDoTextoM2A(texto);
  if (!html) {
    throw new Error("gerar_conteudo_justificativa: parágrafos vazios.");
  }
  console.log(
    `[m2a-ia] justificativa gerada para DFD ${dfdId} (${html.length} chars)`,
  );
  return html;
}
