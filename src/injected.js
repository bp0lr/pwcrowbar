(function () {
  "use strict";

  if (window.__pwcrowbarInstalled__) return;
  Object.defineProperty(window, "__pwcrowbarInstalled__", {
    value: true,
    configurable: false,
    writable: false,
    enumerable: false,
  });

  let compiledRules = [];

  function compile(patterns) {
    return patterns
      .map((pattern) => {
        try {
          return new RegExp(pattern);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function shouldBlock(url) {
    if (!compiledRules.length || !url) return false;
    try {
      const fullUrl = new URL(url, window.location.href).href;
      return compiledRules.some((re) => re.test(fullUrl));
    } catch {
      return false;
    }
  }

  function blocked(method, url) {
    console.info(`[pwcrowbar] blocked ${method} → ${url}`);
  }

  function wrap(proto, propName, kind) {
    if (!proto) return;
    const descriptor = Object.getOwnPropertyDescriptor(proto, propName);
    if (!descriptor) return;

    if (kind === "accessor" && descriptor.set) {
      const originalSet = descriptor.set;
      const originalGet = descriptor.get;
      Object.defineProperty(proto, propName, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: originalGet,
        set(value) {
          if (shouldBlock(value)) {
            blocked(`${proto.constructor?.name || "?"}.${propName} =`, value);
            return;
          }
          originalSet.call(this, value);
        },
      });
    } else if (kind === "method" && typeof descriptor.value === "function") {
      const original = descriptor.value;
      Object.defineProperty(proto, propName, {
        configurable: true,
        enumerable: descriptor.enumerable,
        writable: descriptor.writable,
        value(...args) {
          if (args[0] && shouldBlock(args[0])) {
            blocked(`${propName}()`, args[0]);
            return;
          }
          return original.apply(this, args);
        },
      });
    }
  }

  function installInterceptors() {
    try {
      const locProto = Object.getPrototypeOf(window.location);
      wrap(locProto, "href", "accessor");
      wrap(locProto, "assign", "method");
      wrap(locProto, "replace", "method");
    } catch (error) {
      console.warn("[pwcrowbar] could not wrap location", error);
    }

    try {
      const originalPushState = history.pushState;
      history.pushState = function (state, title, url) {
        if (url) {
          const full = new URL(url, window.location.href).href;
          if (shouldBlock(full)) {
            blocked("history.pushState()", full);
            return;
          }
        }
        return originalPushState.call(this, state, title, url);
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = function (state, title, url) {
        if (url) {
          const full = new URL(url, window.location.href).href;
          if (shouldBlock(full)) {
            blocked("history.replaceState()", full);
            return;
          }
        }
        return originalReplaceState.call(this, state, title, url);
      };
    } catch (error) {
      console.warn("[pwcrowbar] could not wrap history", error);
    }

    try {
      const originalOpen = window.open;
      window.open = function (url, target, features) {
        if (url && shouldBlock(url)) {
          blocked("window.open()", url);
          return null;
        }
        return originalOpen.call(this, url, target, features);
      };
    } catch (error) {
      console.warn("[pwcrowbar] could not wrap window.open", error);
    }

    if (typeof window.navigation?.addEventListener === "function") {
      try {
        window.navigation.addEventListener("navigate", (event) => {
          const target = event?.destination?.url;
          if (target && shouldBlock(target)) {
            blocked("Navigation API", target);
            event.preventDefault?.();
          }
        });
      } catch (error) {
        console.warn("[pwcrowbar] could not subscribe to Navigation API", error);
      }
    }

    window.addEventListener(
      "hashchange",
      (event) => {
        if (shouldBlock(event.newURL)) {
          blocked("hashchange", event.newURL);
          history.replaceState(null, "", event.oldURL);
        }
      },
      { capture: true }
    );

    installMetaRefreshObserver();
  }

  function installMetaRefreshObserver() {
    function inspect(node) {
      if (!(node instanceof Element)) return;
      if (
        node.tagName === "META" &&
        node.getAttribute("http-equiv")?.toLowerCase() === "refresh"
      ) {
        const content = node.getAttribute("content") || "";
        const urlMatch = content.match(/url\s*=\s*['"]?([^'">]+)/i);
        if (urlMatch && shouldBlock(urlMatch[1])) {
          blocked("meta-refresh", urlMatch[1]);
          node.remove();
        }
      }
    }

    document.querySelectorAll('meta[http-equiv]').forEach(inspect);

    try {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach(inspect);
        }
      });
      observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
      });
    } catch (error) {
      console.warn("[pwcrowbar] could not install meta-refresh observer", error);
    }
  }

  function handleRulesMessage(rules) {
    compiledRules = compile(Array.isArray(rules) ? rules : []);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "PWCROWBAR_RULES") return;
    handleRulesMessage(event.data.rules);
  });

  installInterceptors();
  window.postMessage({ type: "PWCROWBAR_REQUEST_RULES" }, "*");
})();
