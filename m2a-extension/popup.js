// popup.js — Mostra status básico da sessão M2A.
(async function () {
  const el = document.getElementById("status");
  try {
    const tabs = await chrome.tabs.query({
      url: "*://*.m2atecnologia.com.br/*",
    });
    if (tabs.length === 0) {
      el.className = "status err";
      el.textContent = "Nenhuma aba do portal M2A aberta.";
      return;
    }
    el.className = "status ok";
    el.textContent = `Portal M2A aberto em ${tabs.length} aba(s). Pronto para operar.`;
  } catch (e) {
    el.className = "status err";
    el.textContent = String(e?.message ?? e);
  }
})();
