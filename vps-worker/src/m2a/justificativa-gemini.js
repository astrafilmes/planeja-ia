// =====================================================================
// Geração da Justificativa da Demanda (DFD) via Gemini + injeção no M2A.
// Executada como ÚLTIMA etapa do orquestrador SRP, depois que todas as
// IRPs já foram consolidadas — evita concorrência no banco do M2A.
// =====================================================================

import FormData from "form-data";
import { m2a } from "../m2a-client.js";
import { config } from "../config.js";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

function fallbackJustificativa(objeto) {
  return [
    `A presente demanda visa a aquisição de ${objeto || "bens/serviços"} para atender às necessidades operacionais das secretarias municipais participantes, em estrita observância aos princípios da legalidade, eficiência e economicidade que regem a Administração Pública.`,
    `Os itens solicitados são essenciais para a continuidade dos serviços prestados à população, garantindo o pleno funcionamento das atividades-fim e meio das unidades administrativas envolvidas.`,
    `O agrupamento das secretarias participantes em um único processo permite ganhos de escala, padronização técnica e redução de custos operacionais, otimizando a gestão de recursos públicos.`,
    `A adoção do Sistema de Registro de Preços (SRP) encontra fundamento na Lei nº 14.133/2021, sendo a modalidade adequada diante da imprevisibilidade dos quantitativos exatos e da necessidade de entregas parceladas conforme a demanda das unidades.`,
    `Conclui-se, portanto, que a contratação atende ao interesse público, alinhando-se aos preceitos de economicidade, eficiência e transparência exigidos pela legislação vigente.`,
  ].join("\n");
}

export async function gerarJustificativaGemini({
  objeto,
  eRegistroPreco = true,
  itens = [],
  secretarias = [],
}) {
  const apiKey = config.gemini?.apiKey;
  if (!apiKey) {
    console.warn("[gemini] GEMINI_API_KEY ausente — usando fallback.");
    return fallbackJustificativa(objeto);
  }

  const listaItens = Array.isArray(itens)
    ? itens.slice(0, 30).map((s) => `- ${s}`).join("\n")
    : String(itens || "");
  const listaSecretarias = Array.isArray(secretarias)
    ? secretarias.join(", ")
    : String(secretarias || "");

  const prompt = `Atue como um Especialista em Licitações Públicas brasileiras. Redija a "Justificativa da Demanda" para um Documento de Formalização de Demanda (DFD), em conformidade com a Lei 14.133/2021.

DADOS:
- Objeto: ${objeto}
- Modalidade: ${eRegistroPreco ? "Sistema de Registro de Preços (SRP)" : "Contratação Direta/Pregão Padrão"}
- Itens principais:
${listaItens}
- Órgãos Participantes: ${listaSecretarias}

REGRAS CRÍTICAS DE FORMATAÇÃO:
- O texto deve ser estritamente dissertativo-argumentativo, tom formal e técnico.
- Deve conter EXATAMENTE 5 parágrafos (1. Introdução, 2. Necessidade dos itens, 3. Economia de escala ao agrupar secretarias, 4. Fundamentação legal/SRP com menção à Lei 14.133/2021, 5. Conclusão).
- NÃO inclua títulos (ex: "Introdução:"). Retorne APENAS o texto corrido.
- Separe cada parágrafo com UMA quebra de linha (\\n).`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[gemini] HTTP ${res.status}: ${body.slice(0, 300)}`);
      return fallbackJustificativa(objeto);
    }
    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p?.text || "")
      .join("")
      .trim();
    if (!texto) {
      console.warn("[gemini] resposta sem texto — usando fallback.");
      return fallbackJustificativa(objeto);
    }
    console.log(`[gemini] justificativa gerada (${texto.length} chars)`);
    return texto;
  } catch (err) {
    console.error(`[gemini] erro: ${err?.message || err}`);
    return fallbackJustificativa(objeto);
  }
}

function textoParaHtmlJustificado(texto) {
  // O M2A salva o conteúdo do Summernote como HTML. A captura real do
  // payload mostra parágrafos separados por linha em branco DENTRO do
  // <div style="text-align: justify;">…</div> — sem <br>, sem <p>.
  const normalizado = String(texto || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const paragrafos = normalizado
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `<div style="text-align: justify;">${paragrafos.join("\n\n")}</div>`;
}

export async function atualizarJustificativaM2A(dfdId, textoGerado) {
  if (!dfdId) throw new Error("atualizarJustificativaM2A: dfdId obrigatório");
  const path = `/gestao_compras/formalizacao_demanda/atualizar_justificativa/${dfdId}/`;
  // CSRF a partir da página de edição da DFD.
  const formPath = `/gestao_compras/formalizacao_demanda/atualizar/${dfdId}/`;
  let csrf;
  try {
    csrf = await m2a.getCsrf(formPath);
  } catch {
    csrf = await m2a.getCsrf("/");
  }

  const html = textoParaHtmlJustificado(textoGerado);

  // Endpoint real espera multipart/form-data (campo "files" é input file
  // vazio do Summernote). Replica fielmente a requisição capturada do
  // navegador.
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

