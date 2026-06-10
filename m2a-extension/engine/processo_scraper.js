// processo_scraper.js — roda no MAIN world da aba M2A.
// Estratégia em cascata via endpoints do portal (sem clicar em abas):
//   1) /licitacao_ata_contrato/tabela/{processoId}/        → lista de atas
//   2) /ata_registro_precos/itens/tabela/{ataId}?page_size=1000  → itens
//   3) /ata_registro_precos/tabela_contratos/{ataId}?page_size=1000 → contratos
// Usa fetch() com cookies de sessão do usuário e DOMParser para extrair.

(function () {
  if (window.__M2A_PROCESSO_SCRAPER__) return;
  window.__M2A_PROCESSO_SCRAPER__ = true;
  const PROCESSO_SCRAPER_VERSION = "1.8.14";
  const SYNC_CONCURRENCY = 3;
  const DEBUG_ITEM_LOGS = false;

  function send(msg) {
    window.postMessage({ __m2aBridge: true, ...msg }, location.origin);
  }

  function debugLog(...args) {
    if (DEBUG_ITEM_LOGS) console.debug(...args);
  }

  function cleanTextValue(value) {
    return String(value ?? "")
      .replace(/\n/g, " ")
      .replace(/\r/g, "")
      .replace(/\\n/g, " ")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function txt(el) {
    return cleanTextValue(el?.textContent ?? "");
  }

  function firstNonEmpty(values) {
    for (const value of values) {
      if (value) return value;
    }
    return "";
  }

  function parseValor(s) {
    if (!s) return 0;
    const c = String(s)
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(c);
    return Number.isFinite(n) ? n : 0;
  }

  function origin() {
    return location.origin;
  }

  function looksLikeCurrency(value) {
    return /R\$|\d+,\d{2}/.test(value || "");
  }

  function looksLikeUnit(value) {
    if (!value) return false;
    const cleaned = String(value).trim();
    if (!cleaned || cleaned.length > 14) return false;
    if (/\s{2,}/.test(cleaned)) return false;
    if (looksLikeCurrency(cleaned)) return false;
    if (/^\d+$/.test(cleaned)) return false;
    return /^[A-Za-z0-9./%-]+$/.test(cleaned);
  }

  function looksLikeValidDescription(value) {
    if (!value) return false;
    const cleaned = String(value).trim();
    // Descrição deve ter pelo menos 5 caracteres e conter letras
    if (cleaned.length < 5) return false;
    if (!/[A-Za-záéíóúàâêôãõç]/i.test(cleaned)) return false;
    // Não pode ser só números/símbolos (como CNPJ, data, etc)
    const letterRatio =
      cleaned.replace(/[^A-Za-záéíóúàâêôãõç]/gi, "").length / cleaned.length;
    return letterRatio > 0.4;
  }

  function extractDigits(value) {
    const match = String(value ?? "").match(/\d+/);
    return match ? match[0] : "";
  }

  function findAtaFornecedorCellText(tdLeft, numeroAta) {
    if (!tdLeft) return "";

    // Primeiro bloco visual da célula costuma conter apenas o fornecedor.
    const mainDiv = tdLeft.querySelector("div");
    if (mainDiv) {
      const mainSpan = mainDiv.querySelector("span");
      const mainText = txt(mainSpan || mainDiv);
      if (mainText && mainText !== numeroAta && mainText.length > 2) {
        debugLog(
          `[M2A Scraper] Fornecedor encontrado no bloco principal: "${mainText}"`,
        );
        return mainText;
      }
    }

    // Procura primeira <span> que não seja badge
    const spans = Array.from(tdLeft.querySelectorAll("span"));
    for (const span of spans) {
      // Ignora badges
      if (span.id && /badge_licitacao_ata_contrato/i.test(span.id)) continue;
      if (span.className && span.className.includes("kt-badge")) continue;

      const cleaned = txt(span);
      if (cleaned && cleaned !== numeroAta && cleaned.length > 2) {
        debugLog(`[M2A Scraper] Fornecedor encontrado em span: "${cleaned}"`);
        return cleaned;
      }
    }

    // Fallback: primeira div
    const divs = Array.from(tdLeft.querySelectorAll("div"));
    if (divs.length > 0) {
      const cleaned = txt(divs[0]);
      if (cleaned && cleaned !== numeroAta && cleaned.length > 2) {
        debugLog(`[M2A Scraper] Fornecedor encontrado em div: "${cleaned}"`);
        return cleaned;
      }
    }

    // Último fallback: texto inteiro
    const result = txt(tdLeft).split("\n")[0].trim();
    debugLog(`[M2A Scraper] Fornecedor (fallback): "${result}"`);
    return result;
  }

  function extractAtaDetailUrl(tr) {
    const fromCell =
      tr
        ?.querySelector("td.details-control[url_detail]")
        ?.getAttribute("url_detail") || "";
    if (fromCell) return fromCell;

    // Fallback para quando o HTML vem "diferente" no payload.
    const html = tr?.outerHTML || "";
    return (
      html.match(/\/licitacao_ata_contrato_item\/subtabela\/\d+\/?/i)?.[0] || ""
    );
  }

  function extractLicitacaoAtaContratoId(tr, detailUrl) {
    const trId = tr?.id || "";
    const fromTrId = trId.match(/tr_licitacao_ata_contrato_(\d+)/i)?.[1] || "";
    if (fromTrId) return fromTrId;

    const onMouse = tr?.getAttribute("onmouseover") || "";
    const fromMouse = onMouse.match(/['"](\d+)['"]/)?.[1] || "";
    if (fromMouse) return fromMouse;

    const fromDetail =
      String(detailUrl || "").match(/\/subtabela\/(\d+)\/?/i)?.[1] || "";
    if (fromDetail) return fromDetail;

    return "";
  }

  function normalizeSubtableUrl(url, fallbackAtaId) {
    const baseRaw = String(url || "").trim();
    const fallback = `/licitacao_ata_contrato_item/subtabela/${fallbackAtaId}`;
    const raw = baseRaw || fallback;

    // Força exatamente ".../subtabela/{id}?page_size=1000" (sem "/" antes do "?")
    const withoutQuery = raw.split("?")[0].replace(/\/+$/, "");
    return `${withoutQuery}?page_size=1000`;
  }

  function decodeEscapedHtmlString(value) {
    return String(value ?? "")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\\\/g, "\\");
  }

  function findHtmlLikeString(node) {
    if (typeof node === "string") {
      if (
        node.includes("<tr") ||
        node.includes("<table") ||
        node.includes("kt-datatable__row") ||
        node.includes("\\n<td")
      ) {
        return node;
      }
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findHtmlLikeString(item);
        if (found) return found;
      }
      return null;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node)) {
        const found = findHtmlLikeString(value);
        if (found) return found;
      }
    }
    return null;
  }

  function coerceHtmlPayload(rawText) {
    const text = String(rawText ?? "");

    // Respostas AJAX da M2A podem vir como JSON com HTML serializado/escapado.
    try {
      const parsed = JSON.parse(text);
      const htmlStr = findHtmlLikeString(parsed);
      if (htmlStr) return decodeEscapedHtmlString(htmlStr);
    } catch (_error) {
      // segue fallback
    }

    // HTML escapado como string crua: "<tr class=\"...\">"
    if (text.includes('\\"') || text.includes("\\n<") || text.includes("\\u")) {
      const decoded = decodeEscapedHtmlString(text);
      if (/<(html|table|tbody|tr|td)\b/i.test(decoded)) return decoded;
    }

    if (/<(html|table|tbody|tr)\b/i.test(text)) return text;

    if (text.includes("\\n<td") || text.includes('\\"')) {
      return decodeEscapedHtmlString(text);
    }
    return text;
  }

  function isLoginPage(html) {
    return (
      /name=["']password["']/i.test(html) ||
      /\/login\//i.test(location.pathname)
    );
  }

  async function fetchHTML(path) {
    const url = path.startsWith("http") ? path : `${origin()}${path}`;
    const res = await fetch(url, {
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/html, */*",
      },
    });
    const text = await res.text();
    const htmlPayload = coerceHtmlPayload(text);
    if (isLoginPage(htmlPayload)) {
      console.warn("[M2A Scraper] Sessão expirada detectada durante fetch.");
      throw new Error("SESSAO_EXPIRADA");
    }
    console.info(
      `[M2A Scraper] GET ${path} → ${res.status} (${text.length} bytes)`,
    );
    return new DOMParser().parseFromString(htmlPayload, "text/html");
  }

  function extractAtasFromDoc(doc) {
    // Procura ancoras tipo /ata_registro_precos/{id}/
    const out = [];
    const anchors = Array.from(
      doc.querySelectorAll('a[href*="/ata_registro_precos/"]'),
    );
    const seen = new Set();
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/ata_registro_precos\/(\d+)\/?/);
      if (!m) continue;
      const ataId = m[1];
      if (seen.has(ataId)) continue;
      seen.add(ataId);

      const numero = txt(a.querySelector("span")) || txt(a);
      // fornecedor: célula .text-left mais próxima no mesmo <tr>
      const tr = a.closest("tr");
      let fornecedor = "";
      let cnpj = "";
      let detailUrl = "";
      let licitacaoAtaContratoId = "";
      if (tr) {
        const cellTxt = txt(tr);
        const cnpjMatch = cellTxt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
        if (cnpjMatch) cnpj = cnpjMatch[0];
        const tdLeft = tr.querySelector("td.text-left");
        fornecedor = findAtaFornecedorCellText(tdLeft, numero);
        detailUrl = extractAtaDetailUrl(tr);
        licitacaoAtaContratoId = extractLicitacaoAtaContratoId(tr, detailUrl);
        if (!fornecedor) {
          // fallback: primeira td que não contenha o link
          const tds = Array.from(tr.querySelectorAll("td"));
          for (const td of tds) {
            if (td.contains(a)) continue;
            const t = txt(td);
            if (t && t !== numero) {
              fornecedor = t;
              break;
            }
          }
        }
      }
      fornecedor = cleanTextValue(fornecedor);
      if (
        !fornecedor ||
        fornecedor === numero ||
        /^\\n(?:\s*\\n)*$/.test(fornecedor)
      ) {
        fornecedor = "";
      }
      out.push({
        id_ata: ataId,
        id_licitacao_ata_contrato: licitacaoAtaContratoId || undefined,
        numero_ata: numero || `ATA-${ataId}`,
        fornecedor: { nome: fornecedor || "", cnpj: cnpj || undefined },
        detail_url: detailUrl || undefined,
      });
    }
    return out;
  }

  function extractItemIdFromRow(tr, ataId, numeroItem, idx) {
    const candidates = [
      tr.id,
      tr.getAttribute("data-id"),
      tr.getAttribute("id_item"),
      tr.querySelector("[id_item]")?.getAttribute("id_item"),
      tr.querySelector("[data-id]")?.getAttribute("data-id"),
      tr.querySelector("input[type='checkbox'][value]")?.value,
    ].filter(Boolean);

    for (const candidate of candidates) {
      const raw = String(candidate).trim();
      if (!raw) continue;
      const hrefId =
        raw.match(
          /\/(?:licitacao_ata_contrato_item|ata_registro_preco_item|ata_registro_precos_item|arp_item)\/(\d+)/,
        )?.[1] ?? "";
      if (hrefId) return hrefId;
      const rowId =
        raw.match(/(?:tr_|row_|item_)(\d+)/)?.[1] || extractDigits(raw);
      if (rowId) return rowId;
    }

    if (numeroItem) return `${ataId}:${numeroItem}`;
    return `${ataId}:row:${idx}`;
  }

  function extractNumeroDescricao(cellsText) {
    for (let i = 0; i < cellsText.length; i++) {
      const text = cellsText[i];
      const inlineMatch = text.match(/^(\d{1,5})\s*[-–.]\s*(.+)$/);
      if (inlineMatch && looksLikeValidDescription(inlineMatch[2])) {
        return {
          numero: inlineMatch[1],
          descricao: inlineMatch[2],
          numeroIndex: i,
        };
      }
    }

    for (let i = 0; i < cellsText.length; i++) {
      const text = cellsText[i];
      if (!/^\d{1,5}$/.test(text)) continue;
      const descricao = firstNonEmpty(
        cellsText
          .slice(i + 1)
          .filter(
            (value) =>
              looksLikeValidDescription(value) &&
              !looksLikeCurrency(value) &&
              !looksLikeUnit(value),
          ),
      );
      if (descricao) {
        return {
          numero: text,
          descricao,
          numeroIndex: i,
        };
      }
    }

    return { numero: "", descricao: "", numeroIndex: -1 };
  }

  function extractItensFromDoc(doc, ataId) {
    const rows = Array.from(
      doc.querySelectorAll(
        [
          "tr.tr_ata_registro_preco_item",
          "tr.tr_licitacao_ata_contrato_item",
          "tr.kt-datatable__row",
          // REMOVER: "tbody tr" era muito amplo e pegava linhas de outras tabelas
        ].join(", "),
      ),
    );
    debugLog(
      `[M2A Scraper] extractItensFromDoc: encontrou ${rows.length} linhas para ataId ${ataId}`,
    );
    const out = [];
    const seen = new Set();
    let idx = 0;
    for (const tr of rows) {
      const cells = tr.querySelectorAll("td");
      if (!cells.length) continue;
      const cellsText = Array.from(cells)
        .map((cell) => txt(cell))
        .filter(Boolean);

      // Um item deve ter pelo menos 4 células (número, descrição, unidade, valor)
      if (cellsText.length < 4) continue;

      const parsed = extractNumeroDescricao(cellsText);
      const numero = parsed.numero;
      const descricao = parsed.descricao;

      if (!numero) {
        debugLog(
          `[M2A Scraper] Nenhum número em: ${cellsText.slice(0, 3).join(" | ")}`,
        );
        continue;
      }

      if (!descricao) {
        debugLog(`[M2A Scraper] Nenhuma descrição para número ${numero}`);
        continue;
      }

      let unidade = "";
      let valor = 0;
      // Procura por valor unitário e unidade
      for (let i = cellsText.length - 2; i >= 0; i--) {
        const text = cellsText[i];
        if (!unidade && looksLikeUnit(text) && text !== numero) unidade = text;
      }
      for (const text of cellsText) {
        if (!valor && looksLikeCurrency(text)) valor = parseValor(text);
      }

      const itemId = extractItemIdFromRow(tr, ataId, numero, ++idx);
      const dedupeKey = `${ataId}|${numero}|${descricao}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      debugLog(
        `[M2A Scraper] Item: #${numero} - ${descricao} (${unidade}) R$ ${valor}`,
      );
      out.push({
        id_item: itemId,
        numero_item: numero,
        descricao,
        unidade,
        valor_unitario: valor,
        id_ata: ataId,
      });
    }
    console.info(
      `[M2A Scraper] ${out.length} itens extraídos para ataId ${ataId}`,
    );
    return out;
  }

  async function fetchItensDaAta(ata) {
    const attempts = [];

    if (ata.detail_url) {
      attempts.push({
        label: "subtabela do processo",
        url: normalizeSubtableUrl(ata.detail_url, ata.id_ata),
      });
    }

    // Endpoint de subtabela usa ID da licitação-ata, não o ID da ata_registro_precos.
    if (ata.id_licitacao_ata_contrato) {
      attempts.push({
        label: "subtabela de licitação (id_licitacao_ata_contrato)",
        url: normalizeSubtableUrl(
          `/licitacao_ata_contrato_item/subtabela/${ata.id_licitacao_ata_contrato}`,
          ata.id_ata,
        ),
      });
    }

    // Fallback legado (alguns ambientes podem aceitar id_ata aqui).
    attempts.push({
      label: "subtabela de licitação (fallback por id_ata)",
      url: normalizeSubtableUrl(
        `/licitacao_ata_contrato_item/subtabela/${ata.id_ata}`,
        ata.id_ata,
      ),
    });
    attempts.push({
      label: "tabela da ata",
      url: `/ata_registro_precos/itens/tabela/${ata.id_ata}?page_size=1000`,
    });

    for (const attempt of attempts) {
      try {
        console.log(
          `[M2A Scraper] Tentando buscar itens via: ${attempt.label} (${attempt.url})`,
        );
        const doc = await fetchHTML(attempt.url);
        const items = extractItensFromDoc(doc, ata.id_ata);
        console.info(
          `[M2A Scraper] ata ${ata.id_ata}: ${items.length} itens via ${attempt.label}`,
        );
        if (items.length > 0) return items;
      } catch (error) {
        console.warn(
          `[M2A Scraper] falha ao ler itens da ata ${ata.id_ata} via ${attempt.label}:`,
          error,
        );
      }
    }

    console.warn(`[M2A Scraper] Nenhum item encontrado para ata ${ata.id_ata}`);
    return [];
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await mapper(
            items[currentIndex],
            currentIndex,
          );
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  // Extrai o número sequencial de strings como "045/2025SECAD" -> 45
  function extrairNumeroSequencial(numeroStr) {
    if (!numeroStr) return 0;
    const m = numeroStr.match(/^(\d+)\//);
    return m ? parseInt(m[1], 10) : 0;
  }

  function extractContratosFromDoc(doc, ataId) {
    const out = [];
    const anchors = Array.from(doc.querySelectorAll('a[href*="/contratos/"]'));
    const seen = new Set();
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/contratos\/(\d+)\/?/);
      if (!m) continue;
      const contratoId = m[1];
      if (seen.has(contratoId)) continue;
      seen.add(contratoId);

      const numero = txt(a.querySelector("span")) || txt(a);
      const tr = a.closest("tr");
      let secretaria = "";
      let valor_total = 0;
      let vigencia = "";
      if (tr) {
        const tdLeft = tr.querySelector("td.text-left");
        secretaria = txt(tdLeft);
        const tds = Array.from(tr.querySelectorAll("td"));
        for (const td of tds) {
          const t = txt(td);
          if (!valor_total && /R\$/.test(t)) {
            const v = parseValor(t);
            if (v > 0) valor_total = v;
          }
          if (!vigencia && /\d{2}\/\d{2}\/\d{4}/.test(t)) {
            vigencia = t;
          }
        }
      }
      out.push({
        id_contrato_m2a: contratoId,
        numero_contrato: numero,
        sequencial: extrairNumeroSequencial(numero),
        id_ata: ataId,
        secretaria_nome: secretaria || "",
        valor_total,
        vigencia,
      });
    }
    return out;
  }

  async function fetchContratosDaAta(ata) {
    try {
      const docCon = await fetchHTML(
        `/ata_registro_precos/tabela_contratos/${ata.id_ata}?page_size=1000`,
      );
      const contratos = extractContratosFromDoc(docCon, ata.id_ata);
      console.info(
        `[M2A Scraper] ata ${ata.id_ata}: ${contratos.length} contratos`,
      );
      return contratos;
    } catch (error) {
      console.warn(`[M2A Scraper] falha contratos ata ${ata.id_ata}:`, error);
      return [];
    }
  }

  async function sincronizarAta(ata, index, total, requestId) {
    send({
      type: "M2A_SYNC_PROCESSO_PROGRESS",
      requestId,
      etapa: "ata",
      mensagem: `Sincronizando Ata ${index + 1}/${total} (${ata.numero_ata})`,
    });

    const [itens, contratos] = await Promise.all([
      fetchItensDaAta(ata),
      fetchContratosDaAta(ata),
    ]);

    if (!itens.length) {
      console.warn(
        `[M2A Scraper] nenhum item detectado para ata ${ata.id_ata}`,
      );
    }

    return { ata, itens, contratos };
  }

  async function runCascata(processoId, requestId) {
    console.group(`[M2A Scraper] Sincronização do Processo: ${processoId}`);
    const startTime = performance.now();
    send({
      type: "M2A_SYNC_PROCESSO_PROGRESS",
      requestId,
      etapa: "atas",
      mensagem: "Buscando atas do processo",
    });

    const atasDoc = await fetchHTML(
      `/licitacao_ata_contrato/tabela/${processoId}/`,
    );
    const atas = extractAtasFromDoc(atasDoc);
    console.info(
      `[M2A Scraper] ${atas.length} atas encontradas para processo ${processoId}`,
    );
    console.table(
      atas.map((ata) => ({
        ata_id: ata.id_ata,
        numero_ata: ata.numero_ata,
        fornecedor: ata.fornecedor?.nome || "(sem fornecedor)",
        detail_url: ata.detail_url || "",
      })),
    );

    const resultados = await mapWithConcurrency(
      atas,
      SYNC_CONCURRENCY,
      (ata, index) => sincronizarAta(ata, index, atas.length, requestId),
    );
    const itens = resultados.flatMap((result) => result.itens);
    const contratos = resultados.flatMap((result) => result.contratos);

    // Gera Resumo para o Banco de Dados
    const resumo = {
      qtd_atas: atas.length,
      qtd_itens: itens.length,
      qtd_contratos: contratos.length,
      ultimo_numero_por_secretaria: {},
    };

    // Calcula o último número de contrato visto no portal para cada secretaria detectada
    contratos.forEach((c) => {
      const sec = c.secretaria_nome || "NÃO IDENTIFICADA";
      const atual = resumo.ultimo_numero_por_secretaria[sec] || 0;
      if (c.sequencial > atual) {
        resumo.ultimo_numero_por_secretaria[sec] = c.sequencial;
      }
    });

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`[M2A Scraper] Sincronização concluída em ${duration}s`);
    console.groupEnd();
    return {
      atas,
      itens,
      contratos_existentes: contratos,
      resumo,
    };
  }

  function getProcessoIdFromUrl() {
    const m =
      location.pathname.match(/\/processo_administrativo\/(\d+)/) ||
      location.pathname.match(/\/detail\/(\d+)/);
    return m ? m[1] : null;
  }

  window.addEventListener("M2A_SYNC_PROCESSO_RUN", async (ev) => {
    const detail = ev.detail || {};
    const requestId = detail.requestId;
    const processoId = detail.processoId || getProcessoIdFromUrl();
    try {
      if (!processoId)
        throw new Error("Não consegui identificar o ID do processo na URL.");
      console.info(
        `[M2A Scraper v${PROCESSO_SCRAPER_VERSION}] iniciando cascata processo=${processoId}`,
      );

      const payload = await runCascata(processoId, requestId);
      console.info(
        `[M2A Scraper] resultado: ${payload.atas.length} atas, ${payload.itens.length} itens, ${payload.contratos_existentes.length} contratos`,
      );

      send({
        type: "M2A_SYNC_PROCESSO_COMPLETE",
        requestId,
        payload,
      });
    } catch (err) {
      console.error("[M2A Scraper] erro:", err);
      send({
        type: "M2A_SYNC_PROCESSO_COMPLETE",
        requestId,
        erro: String(err?.message ?? err),
      });
    }
  });
})();
