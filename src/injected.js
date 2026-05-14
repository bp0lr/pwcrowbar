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
  let lastRulesSerialized = null;
  let interceptorsInstalled = false;
  let metaObserver = null;

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

  const ABSOLUTE_URL = /^https?:\/\//i;
  function shouldBlock(url) {
    if (!compiledRules.length || !url) return false;
    let target = url;
    if (typeof target !== "string" || !ABSOLUTE_URL.test(target)) {
      try {
        target = new URL(url, window.location.href).href;
      } catch {
        return false;
      }
    }
    return compiledRules.some((re) => re.test(target));
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
      for (const name of ["pushState", "replaceState"]) {
        const original = history[name];
        history[name] = function (state, title, url) {
          if (url && shouldBlock(url)) {
            blocked(`history.${name}()`, url);
            return;
          }
          return original.call(this, state, title, url);
        };
      }
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
    const inspect = (node) => {
      if (!(node instanceof Element)) return;
      if (node.tagName !== "META") return;
      if (node.getAttribute("http-equiv")?.toLowerCase() !== "refresh") return;
      const url = node.getAttribute("content")?.match(/url\s*=\s*['"]?([^'">]+)/i)?.[1];
      if (url && shouldBlock(url)) {
        blocked("meta-refresh", url);
        node.remove();
      }
    };

    let scoped = false;
    metaObserver = new MutationObserver((mutations) => {
      if (!scoped && document.head) {
        scoped = true;
        metaObserver.disconnect();
        metaObserver.observe(document.head, { childList: true, subtree: false });
        document.head.querySelectorAll("meta[http-equiv]").forEach(inspect);
        return;
      }
      for (const m of mutations) m.addedNodes.forEach(inspect);
    });

    if (document.head) {
      scoped = true;
      metaObserver.observe(document.head, { childList: true, subtree: false });
      document.head.querySelectorAll("meta[http-equiv]").forEach(inspect);
    } else {
      metaObserver.observe(document.documentElement, { childList: true, subtree: false });
    }

    const teardown = () => {
      metaObserver?.disconnect();
      metaObserver = null;
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", teardown, { once: true });
    } else {
      teardown();
    }
  }

  function handleRulesMessage(rules) {
    const next = Array.isArray(rules) ? rules : [];
    const serialized = JSON.stringify(next);
    if (serialized === lastRulesSerialized) return;
    lastRulesSerialized = serialized;
    compiledRules = compile(next);

    if (compiledRules.length > 0 && !interceptorsInstalled) {
      interceptorsInstalled = true;
      installInterceptors();
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "PWCROWBAR_RULES") return;
    handleRulesMessage(event.data.rules);
  });

  window.postMessage({ type: "PWCROWBAR_REQUEST_RULES" }, "*");
})();
