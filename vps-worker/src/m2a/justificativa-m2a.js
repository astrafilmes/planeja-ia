// =====================================================================
// Justificativa da Demanda via IA NATIVA do M2A ("MIA!").
//
// Fluxo real observado no navegador (sniffer 26/jun/2026):
//
//   1. POST /gestao_compras/formalizacao_demanda/gerar_conteudo_justificativa/{dfdId}/
//        body: x-www-form-urlencoded { csrfmiddlewaretoken, prompt }
//        → ~10–20 s, SÍNCRONO. Resposta:
//          { "status": "success", "mensagem": "Texto atualizado com sucesso!" }
//        A IA já gravou o texto no banco do M2A.
//
//   2. GET /gestao_compras/formalizacao_demanda/atualizar_justificativa/{dfdId}/
//        → JSON { html_form: "...<textarea name='justificativa_demanda'>TEXTO</textarea>..." }
//        O TEXTO já é o HTML do Summernote (vem com &lt; e &gt; HTML-encoded).
//
//   3. POST /gestao_compras/formalizacao_demanda/atualizar_justificativa/{dfdId}/
//        multipart: csrfmiddlewaretoken + justificativa_demanda + files (vazio)
//
// Não há WebSocket, SSE ou polling — o passo 1 já é bloqueante.
// =====================================================================

import FormData from "form-data";
import { m2a } from "../m2a-client.js";
import { config } from "../config.js";

const PROMPT_PADRAO =
  "Atue como redator técnico-jurídico da Administração Pública municipal e elabore a Justificativa da Demanda para o Documento de Formalização de Demanda (DFD), em conformidade com a Lei nº 14.133/2021. Expanda de forma DENSA e ARGUMENTATIVA a descrição do objeto, em texto dissertativo-argumentativo de NO MÍNIMO 5 parágrafos extensos (entre 80 e 150 palavras cada), estruturados em: 1) Introdução com contextualização da relevância da aquisição/contratação para o interesse público; 2-4) Desenvolvimento com (a) cenário atual e necessidade concreta para a continuidade dos serviços, (b) benefícios técnicos e econômicos — padronização, ganhos de escala, previsibilidade, competitividade —, (c) otimização de recursos públicos, planejamento orçamentário, transparência e isonomia entre fornecedores; 5) Conclusão reafirmando a aderência aos princípios da legalidade, eficiência, economicidade e transparência. NÃO cite o nome de secretaria específica nem do município. Use tom formal, impessoal (3ª pessoa), vocabulário próprio da Administração Pública. Cada parágrafo iniciado por sua numeração (1., 2., 3., …). Sem títulos, listas, marcadores ou markdown. Apenas texto corrido.\n";

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
  const m = html.match(
    /<textarea[^>]*name=["']justificativa_demanda["'][^>]*>([\s\S]*?)<\/textarea>/i,
  );
  if (!m) return "";
  return decodeHtmlEntities(m[1]).trim();
}

function normalizarHtmlJustificativa(texto) {
  const t = String(texto || "").trim();
  if (!t) return "";
  // Se já vier com <div>/<p>, repassa como está (é o formato do Summernote).
  if (/^<(div|p|span)\b/i.test(t)) return t;
  // Caso contrário, monta o envelope padrão.
  const paragrafos = t
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragrafos.length) return "";
  return `<div style="text-align: justify;">${paragrafos.join("<br><br>")}</div>`;
}

/**
 * Lê a justificativa atualmente salva na DFD (passo 2 do fluxo).
 * Retorna o HTML pronto para reaplicar via `atualizarJustificativaM2A`,
 * ou string vazia se não houver texto.
 */
export async function lerJustificativaSalva(dfdId) {
  const path = `/gestao_compras/formalizacao_demanda/atualizar_justificativa/${dfdId}/`;
  const r = await m2a.get(path, {
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (r.status >= 400) return "";
  let data = null;
  try {
    data = typeof r.html === "string" ? JSON.parse(r.html) : r.html;
  } catch {
    // Resposta não é JSON — pode ser HTML cru com a textarea.
    return extrairTextareaJustificativa(r.html);
  }
  const htmlForm = data?.html_form || data?.htmlForm || "";
  return extrairTextareaJustificativa(htmlForm);
}

/**
 * Chama a IA nativa do M2A. Síncrono: a resposta `success` significa que
 * o texto JÁ FOI GRAVADO no banco. Em seguida lê o texto via GET e retorna
 * o HTML pronto para reaplicar nas demais DFDs.
 *
 * Não há fallback aqui — o orquestrador decide o que fazer em caso de erro.
 */
export async function gerarJustificativaM2A(
  dfdId,
  { prompt, timeoutMs = 90_000, signal } = {},
) {
  if (!dfdId) throw new Error("gerarJustificativaM2A: dfdId obrigatório");
  if (signal?.aborted) throw new Error("Operação cancelada pelo usuário.");

  const formPath = `/gestao_compras/formalizacao_demanda/${dfdId}/`;
  const postPath = `/gestao_compras/formalizacao_demanda/gerar_conteudo_justificativa/${dfdId}/`;

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

  const t0 = Date.now();
  console.log(
    `[m2a-ia] DFD ${dfdId}: chamando MIA! (síncrono, timeout=${Math.round(timeoutMs / 1000)}s)…`,
  );
  const r = await m2a.postForm(postPath, body, {
    timeout: timeoutMs,
    headers: {
      Referer: `${config.m2a.baseUrl}${formPath}`,
      Origin: config.m2a.baseUrl,
      Accept: "*/*",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status >= 400) {
    throw new Error(`gerar_conteudo_justificativa HTTP ${r.status} após ${dur}s`);
  }

  // Confirma sucesso ({"status":"success","mensagem":"Texto atualizado com sucesso!"}).
  let okIa = false;
  try {
    const data = typeof r.html === "string" ? JSON.parse(r.html) : r.html;
    okIa = String(data?.status || "").toLowerCase() === "success";
  } catch {
    // Algumas respostas vêm sem JSON estrito — não fatal.
    okIa = /success/i.test(String(r.html || ""));
  }
  console.log(
    `[m2a-ia] DFD ${dfdId}: MIA! retornou em ${dur}s (status=${r.status}, ok=${okIa})`,
  );
  if (!okIa) {
    throw new Error(
      `MIA! respondeu sem sucesso: ${String(r.html || "").slice(0, 200)}`,
    );
  }

  // Lê o texto que a MIA acabou de gravar.
  const texto = await lerJustificativaSalva(dfdId);
  if (!texto || texto.length < 20) {
    throw new Error("MIA! reportou sucesso, mas a textarea ficou vazia.");
  }
  const html = normalizarHtmlJustificativa(texto);
  console.log(
    `[m2a-ia] DFD ${dfdId}: justificativa lida (${html.length} chars).`,
  );
  return html;
}

/**
 * POST /atualizar_justificativa/ — sobrescreve o texto da DFD com `textoGerado`.
 * Aceita texto puro (parágrafos por \n) OU HTML já pronto.
 */
export async function atualizarJustificativaM2A(dfdId, textoGerado) {
  if (!dfdId) throw new Error("atualizarJustificativaM2A: dfdId obrigatório");
  const path = `/gestao_compras/formalizacao_demanda/atualizar_justificativa/${dfdId}/`;
  const formPath = `/gestao_compras/formalizacao_demanda/atualizar/${dfdId}/`;

  let csrf;
  try {
    csrf = await m2a.getCsrf(formPath);
  } catch {
    csrf = await m2a.getCsrf("/");
  }

  const html = normalizarHtmlJustificativa(textoGerado);
  if (!html) throw new Error("atualizarJustificativaM2A: texto vazio");

  const form = new FormData();
  form.append("csrfmiddlewaretoken", csrf);
  form.append("justificativa_demanda", html);
  form.append("files", Buffer.alloc(0), {
    filename: "",
    contentType: "application/octet-stream",
  });

  const r = await m2a.postMultipart(path, form, {
    headers: {
      Referer: `${config.m2a.baseUrl}${formPath}`,
      Origin: config.m2a.baseUrl,
    },
  });
  if (r.status >= 400) {
    throw new Error(
      `atualizar_justificativa falhou (status=${r.status}, finalUrl=${r.finalUrl || "-"})`,
    );
  }
  console.log(`[m2a] justificativa atualizada na DFD ${dfdId} (status ${r.status})`);
  return { status: r.status };
}

/**
 * Texto puro de emergência — usado se a MIA! falhar redondamente.
 * Não cita secretaria ou município (genérico, reutilizável).
 */
export function justificativaFallback(objeto, eRegistroPreco = false) {
  const base = objeto && String(objeto).trim() ? String(objeto).trim() : "bens e serviços de interesse público";
  const srpTxt = eRegistroPreco
    ? "A adoção do Sistema de Registro de Preços, com fundamento na Lei nº 14.133/2021, mostra-se a modalidade mais adequada diante da imprevisibilidade dos quantitativos exatos a serem consumidos e da necessidade de entregas parceladas conforme a demanda das unidades administrativas, permitindo maior eficiência na gestão dos recursos públicos e racionalização dos procedimentos licitatórios."
    : "A presente contratação encontra fundamento na Lei nº 14.133/2021, observados os princípios constitucionais que regem a Administração Pública, em especial os da legalidade, impessoalidade, moralidade, publicidade, eficiência e economicidade.";
  return [
    `A presente demanda visa à aquisição/contratação de ${base}, indispensável à continuidade e ao adequado funcionamento das atividades-fim e meio das unidades administrativas envolvidas, observados os princípios constitucionais que regem a Administração Pública, em especial os da legalidade, impessoalidade, moralidade, publicidade, eficiência e economicidade, em estrita conformidade com o ordenamento jurídico vigente.`,
    `O cenário atual evidencia a necessidade concreta dos itens/serviços solicitados, cuja indisponibilidade comprometeria diretamente a prestação dos serviços públicos à população, com prejuízos potenciais à execução das políticas públicas planejadas, ao atendimento das obrigações legais e à manutenção da regularidade operacional das atividades administrativas e finalísticas das unidades envolvidas no presente certame.`,
    `Sob o aspecto técnico e econômico, a consolidação da demanda proporciona ganhos de escala, padronização, previsibilidade orçamentária, ampliação da competitividade entre fornecedores e obtenção de melhores condições comerciais, mediante procedimento licitatório único, em substituição a múltiplas contratações fragmentadas, com reflexos positivos na qualidade dos bens e serviços recebidos e na racionalização dos custos de transação inerentes a cada processo.`,
    `${srpTxt} A medida fortalece a transparência, a isonomia entre licitantes e o controle social sobre a aplicação dos recursos públicos, em conformidade com as melhores práticas de governança e com os deveres de planejamento e de motivação dos atos administrativos.`,
    `Conclui-se, portanto, que a presente contratação atende plenamente ao interesse público, alinhando-se aos preceitos de legalidade, eficiência, economicidade e transparência exigidos pela legislação vigente, sendo medida necessária, adequada e proporcional à satisfação da demanda identificada, motivo pelo qual se justifica sua formalização nos termos propostos.`,
  ].join("\n");
}
