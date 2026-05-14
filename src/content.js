(function () {
  "use strict";

  let cachedRules = [];

  async function loadRules() {
    try {
      const { redirectRules = [] } = await chrome.storage.sync.get("redirectRules");
      cachedRules = (Array.isArray(redirectRules) ? redirectRules : [])
        .map((rule) => rule?.domainPattern)
        .filter((pattern) => typeof pattern === "string" && pattern.length);
    } catch (error) {
      console.warn("[pwcrowbar] Failed to load redirect rules", error);
      cachedRules = [];
    }
  }

  function pushRulesToMain() {
    window.postMessage({ type: "PWCROWBAR_RULES", rules: cachedRules }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "PWCROWBAR_REQUEST_RULES") return;
    pushRulesToMain();
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "sync" || !changes.redirectRules) return;
    await loadRules();
    pushRulesToMain();
  });

  loadRules().then(pushRulesToMain);
})();
