// m2a_bridge.js — Content script no portal M2A.
// Faz ponte entre o MAIN world (engines) e o service worker da extensão.

(function () {
  const version = chrome.runtime?.getManifest?.().version ?? "dev";
  if (window.__M2A_PORTAL_BRIDGE_LOADED__) {
    console.info("[M2A Integrador] Ponte M2A já estava carregada nesta aba.");
    return;
  }
  window.__M2A_PORTAL_BRIDGE_LOADED__ = true;
  console.info(`[M2A Integrador] Ponte M2A carregada v${version}`, {
    href: location.href,
    origin: location.origin,
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || typeof d !== "object") return;
    if (event.origin && event.origin !== location.origin) return;
    if (
      d.type === "M2A_SYNC_RESULT" ||
      d.type === "M2A_SYNC_PROGRESS" ||
      d.type === "M2A_PROGRESS" ||
      d.type === "M2A_SYNC_PROCESSO_PROGRESS" ||
      d.type === "M2A_SYNC_PROCESSO_COMPLETE"
    ) {
      try {
        console.groupCollapsed(
          "[M2A Integrador] Enviando evento da aba M2A para a extensão",
          d.type,
          d.requestId ?? d.contratoId ?? "sem-id",
        );
        console.info("Evento:", d);
        console.info("URL da aba:", location.href);
        console.groupEnd();
        chrome.runtime.sendMessage(d, () => void chrome.runtime.lastError);
      } catch {
        /* extension reload */
      }
    }
  });
})();
