(function () {
  "use strict";

  let redirectRules = [];

  async function loadRedirectRules() {
    try {
      const { redirectRules: stored = [] } = await chrome.storage.sync.get("redirectRules");
      redirectRules = stored
        .map((rule) => {
          if (!rule.domainPattern) return null;
          try {
            return rule.domainPattern;
          } catch (error) {
            console.warn(`[pwcrowbar] Invalid regex: ${rule.domainPattern}`, error);
            return null;
          }
        })
        .filter(Boolean);
      
      console.log(`[pwcrowbar] Loaded ${redirectRules.length} redirect rules`);
      injectScript();
      setTimeout(updateInjectedRules, 100);
    } catch (error) {
      console.error("[pwcrowbar] Failed to load redirect rules", error);
      redirectRules = [];
      injectScript();
      setTimeout(updateInjectedRules, 100);
    }
  }

  function injectScript() {
    const existing = document.querySelector('script[src*="injected.js"]');
    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/injected.js");
    script.dataset.rules = JSON.stringify(redirectRules);
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function updateInjectedRules() {
    window.postMessage(
      {
        type: "PWCROWBAR_UPDATE_RULES",
        rules: redirectRules,
      },
      "*"
    );
  }

  function init() {
    console.log("[pwcrowbar] Content script initialized");
    loadRedirectRules();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && changes.redirectRules) {
        console.log("[pwcrowbar] Redirect rules changed, reloading...");
        loadRedirectRules().then(() => {
          setTimeout(updateInjectedRules, 100);
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
