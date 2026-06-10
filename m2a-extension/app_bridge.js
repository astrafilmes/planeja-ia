// app_bridge.js — Content script no sistema Planejamento.
// Ponte entre window.postMessage (app) e chrome.runtime (extensão).

(function () {
  if (window.__M2A_BRIDGE_LOADED__) {
    console.info(
      "[M2A Integrador] Ponte do app já estava carregada nesta aba.",
    );
    return;
  }
  window.__M2A_BRIDGE_LOADED__ = true;
  console.info(
    `[M2A Integrador] Ponte do app carregada v${chrome.runtime.getManifest().version}`,
  );

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin && event.origin !== location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "M2A_BRIDGE_PING") {
      window.postMessage(
        {
          type: "M2A_BRIDGE_PONG",
          active: true,
          version: chrome.runtime.getManifest().version,
        },
        location.origin,
      );
      return;
    }

    // Facilitador para o App checar status sem iniciar automação
    if (data.type === "M2A_REQUEST_STATUS") {
      chrome.runtime.sendMessage({
        type: "M2A_CHECK_STATUS",
        payload: data.payload,
      });
      return;
    }

    if (
      data.type === "M2A_START_AUTOMATION" ||
      data.type === "M2A_DIAGNOSTIC_AUTOMATION" ||
      data.type === "M2A_START_PROCESS_CREATION"
    ) {
      chrome.runtime.sendMessage(
        {
          type:
            data.type === "M2A_DIAGNOSTIC_AUTOMATION"
              ? "M2A_DIAGNOSTIC_AUTOMATION"
              : data.type === "M2A_START_PROCESS_CREATION"
                ? "M2A_START_PROCESS_CREATION"
                : "M2A_START_AUTOMATION",
          payload: data.payload,
          origin: location.origin,
        },
        () => void chrome.runtime.lastError,
      );
      return;
    }

    if (data.type === "M2A_SYNC_NUMERACAO") {
      chrome.runtime.sendMessage(
        {
          type: "M2A_SYNC_START",
          payload: data.payload,
          origin: location.origin,
        },
        () => void chrome.runtime.lastError,
      );
      return;
    }

    if (data.type === "M2A_START_SYNC_PROCESSO") {
      console.info(
        "[M2A Integrador] Solicitação de sincronização de processo recebida do app:",
        data.payload?.requestId,
      );
      chrome.runtime.sendMessage(
        {
          type: "M2A_SYNC_PROCESSO_START",
          payload: data.payload,
          origin: location.origin,
        },
        () => void chrome.runtime.lastError,
      );
      return;
    }

    if (data.type === "M2A_BULK_DOWNLOAD") {
      chrome.runtime.sendMessage(
        {
          type: "M2A_BULK_DOWNLOAD",
          documentos: data.documentos,
          options: data.options,
          origin: location.origin,
        },
        () => void chrome.runtime.lastError,
      );
      return;
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (
      msg.type === "M2A_PROGRESS" ||
      msg.type === "M2A_BULK_DOWNLOAD_PROGRESS" ||
      msg.type === "M2A_SYNC_PROGRESS" ||
      msg.type === "M2A_SYNC_RESULT" ||
      msg.type === "M2A_SYNC_PROCESSO_PROGRESS" ||
      msg.type === "M2A_SYNC_PROCESSO_COMPLETE"
    ) {
      window.postMessage(msg, location.origin);
    }
  });
})();
