(function () {
  "use strict";

  let cachedRules = [];
  let lastPushedSerialized = null;

  function extractPatterns(raw) {
    return (Array.isArray(raw) ? raw : [])
      .map((rule) => rule?.domainPattern)
      .filter((pattern) => typeof pattern === "string" && pattern.length);
  }

  function syncToMain() {
    const serialized = JSON.stringify(cachedRules);
    if (serialized === lastPushedSerialized) return;
    lastPushedSerialized = serialized;
    window.postMessage({ type: "PWCROWBAR_RULES", rules: cachedRules }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "PWCROWBAR_REQUEST_RULES") return;
    syncToMain();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.redirectRules) return;
    cachedRules = extractPatterns(changes.redirectRules.newValue);
    syncToMain();
  });

  chrome.storage.local
    .get("redirectRules")
    .then(({ redirectRules }) => {
      cachedRules = extractPatterns(redirectRules);
      syncToMain();
    })
    .catch((error) => {
      console.warn("[pwcrowbar] Failed to load redirect rules", error);
    });
})();
