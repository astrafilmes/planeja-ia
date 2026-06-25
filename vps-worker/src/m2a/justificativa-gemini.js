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

  const prompt = `Atue como um Especialista em Licitações Públicas brasileiras e redator técnico da Administração Pública municipal. Sua tarefa é elaborar a "Justificativa da Demanda" para um Documento de Formalização de Demanda (DFD), em conformidade com a Lei 14.133/2021.

DADOS DA DEMANDA:
- Objeto: ${objeto}
- Modalidade: ${eRegistroPreco ? "Sistema de Registro de Preços (SRP)" : "Contratação Direta/Pregão Padrão"}
- Itens principais:
${listaItens}
- Órgãos/Secretarias Participantes: ${listaSecretarias}

TAREFA:
Expanda de forma abrangente a descrição do objeto, elaborando um texto no formato DISSERTATIVO-ARGUMENTATIVO, robusto e detalhado, justificando de forma convincente a necessidade desta demanda para a Administração Pública municipal.

ESTRUTURA OBRIGATÓRIA (mínimo 5 parágrafos, podendo chegar a 6 ou 7 se houver riqueza de conteúdo):
1. INTRODUÇÃO (1 parágrafo): contextualize a importância da aquisição/contratação para o município e para o(s) órgão(s) solicitante(s), apresentando o objeto e sua relevância estratégica.
2. DESENVOLVIMENTO (no MÍNIMO 3 parágrafos extensos, um por aspecto):
   a) Cenário atual, desafios operacionais e necessidade concreta dos itens/serviços para a continuidade dos serviços públicos prestados à população.
   b) Benefícios técnicos e econômicos: padronização, previsibilidade, ganhos de escala pelo agrupamento de secretarias, competitividade entre fornecedores, qualidade e melhores condições comerciais.
   c) Otimização de recursos públicos, planejamento orçamentário, redução de processos licitatórios repetitivos, transparência, isonomia entre fornecedores e fortalecimento da confiança da população na gestão pública.
3. CONCLUSÃO (1 parágrafo): reafirme a relevância estratégica da demanda, vinculando-a ao interesse público, aos princípios da legalidade, eficiência, economicidade e transparência, e à melhoria da qualidade de vida da população.

REGRAS CRÍTICAS DE REDAÇÃO E FORMATAÇÃO:
- Cada parágrafo deve ser DENSO e EXTENSO (entre 80 e 150 palavras), com argumentação encadeada — NUNCA frases curtas e isoladas.
- Tom estritamente formal, técnico-jurídico, impessoal (3ª pessoa). Vocabulário próprio da Administração Pública.
- Cite expressamente a Lei nº 14.133/2021 ao tratar do SRP/fundamentação legal, quando aplicável.
- Quando os dados informarem o nome do município e da(s) secretaria(s), MENCIONE-OS nominalmente ao longo do texto para personalizar a justificativa.
- NÃO inclua títulos, marcadores, numeração de seções, listas ou cabeçalhos (nada de "Introdução:", "1.", "a)" etc.). Retorne APENAS o texto corrido em parágrafos.
- Separe cada parágrafo por UMA quebra de linha simples (\\n). Não use linhas em branco extras.
- NÃO use markdown (sem **, sem *, sem #). Texto puro.
- O resultado final deve ter no mínimo 500 palavras no total.`;

  // Sem retry: se o Gemini falhar (429/503/qualquer erro), caímos
  // imediatamente no fallback textual. Solicitado pelo usuário para evitar
  // longas esperas quando o modelo está sob alta demanda.
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[gemini] HTTP ${res.status} — usando fallback. ${body.slice(0, 200)}`,
      );
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
    console.warn(`[gemini] erro — usando fallback: ${err?.message || err}`);
    return fallbackJustificativa(objeto);
  }
}

function textoParaHtmlJustificado(texto) {
  const str = String(texto || "").trim();
  // Se já vier como HTML pronto (ex.: vindo da IA nativa do M2A), repassa.
  if (/^<(div|p|span)\b/i.test(str)) return str;
  const normalizado = str
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const paragrafos = normalizado
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `<div style="text-align: justify;">${paragrafos.join("<br><br>")}</div>`;
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

