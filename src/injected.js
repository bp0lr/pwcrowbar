(function () {
  "use strict";

  const PWCROWBAR_KEY = "__pwcrowbarRules__";
  let redirectRules = [];

  function loadRules() {
    try {
      const scriptTag = document.currentScript || document.querySelector('script[data-rules]');
      if (scriptTag && scriptTag.dataset.rules) {
        const rulesData = JSON.parse(scriptTag.dataset.rules);
        redirectRules = rulesData
          .map((pattern) => {
            try {
              return new RegExp(pattern);
            } catch (error) {
              console.warn(`[pwcrowbar] Invalid regex: ${pattern}`, error);
              return null;
            }
          })
          .filter(Boolean);
        
        window[PWCROWBAR_KEY] = redirectRules;
        console.log(`[pwcrowbar] Loaded ${redirectRules.length} redirect rules in MAIN context`);
      }
    } catch (error) {
      console.error("[pwcrowbar] Failed to load rules in MAIN context", error);
      redirectRules = [];
      window[PWCROWBAR_KEY] = [];
    }
  }

  function shouldBlockRedirect(url) {
    if (!url) return false;

    const rules = redirectRules.length ? redirectRules : (window[PWCROWBAR_KEY] || []);
    if (!rules.length) return false;

    try {
      const urlObj = new URL(url, window.location.href);
      const fullUrl = urlObj.href;

      const matched = rules.some((regex) => regex.test(fullUrl));

      return matched;
    } catch (error) {
      console.warn("[pwcrowbar] Invalid URL:", url, error);
      return false;
    }
  }

  function blockRedirect(url, method) {
    console.info(`[pwcrowbar] ✅ BLOCKED redirect to: ${url} (via ${method})`);
    return false;
  }

  function interceptLocationHref() {
    try {
      const location = window.location;
      const proto = Object.getPrototypeOf(location);
      
      if (proto && proto.href !== undefined) {
        const originalSetter = Object.getOwnPropertyDescriptor(proto, "href")?.set;
        if (originalSetter) {
          Object.defineProperty(proto, "href", {
            get: Object.getOwnPropertyDescriptor(proto, "href").get,
            set: function (value) {
              if (shouldBlockRedirect(value)) {
                blockRedirect(value, "location.href =");
                return;
              }
              originalSetter.call(this, value);
            },
            configurable: true,
            enumerable: true,
          });
        }
      }
    } catch (error) {
      console.warn("[pwcrowbar] Could not intercept location.href", error);
    }
  }

  function interceptLocationMethods() {
    try {
      const location = window.location;
      const proto = Object.getPrototypeOf(location);

      if (proto && proto.replace) {
        const originalReplace = proto.replace;
        Object.defineProperty(proto, "replace", {
          value: function (url) {
            if (shouldBlockRedirect(url)) {
              blockRedirect(url, "location.replace()");
              return;
            }
            return originalReplace.call(this, url);
          },
          writable: true,
          configurable: true,
        });
      }

      if (proto && proto.assign) {
        const originalAssign = proto.assign;
        Object.defineProperty(proto, "assign", {
          value: function (url) {
            if (shouldBlockRedirect(url)) {
              blockRedirect(url, "location.assign()");
              return;
            }
            return originalAssign.call(this, url);
          },
          writable: true,
          configurable: true,
        });
      }
    } catch (error) {
      console.warn("[pwcrowbar] Could not intercept location methods", error);
    }
  }

  function interceptHistory() {
    try {
      const originalPushState = history.pushState;
      history.pushState = function (state, title, url) {
        if (url) {
          const fullUrl = new URL(url, window.location.href).href;
          if (shouldBlockRedirect(fullUrl)) {
            blockRedirect(fullUrl, "history.pushState()");
            return;
          }
        }
        return originalPushState.call(history, state, title, url);
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = function (state, title, url) {
        if (url) {
          const fullUrl = new URL(url, window.location.href).href;
          if (shouldBlockRedirect(fullUrl)) {
            blockRedirect(fullUrl, "history.replaceState()");
            return;
          }
        }
        return originalReplaceState.call(history, state, title, url);
      };
    } catch (error) {
      console.warn("[pwcrowbar] Could not intercept history", error);
    }
  }

  function interceptWindowOpen() {
    try {
      const originalOpen = window.open;
      window.open = function (url, target, features) {
        if (url && shouldBlockRedirect(url)) {
          blockRedirect(url, "window.open()");
          return null;
        }
        return originalOpen.call(window, url, target, features);
      };
    } catch (error) {
      console.warn("[pwcrowbar] Could not intercept window.open", error);
    }
  }

  function interceptDocumentLocation() {
    try {
      if (document.location) {
        const docLoc = document.location;
        const proto = Object.getPrototypeOf(docLoc);
        
        if (proto && proto.href !== undefined) {
          const originalSetter = Object.getOwnPropertyDescriptor(proto, "href")?.set;
          if (originalSetter) {
            Object.defineProperty(proto, "href", {
              get: Object.getOwnPropertyDescriptor(proto, "href").get,
              set: function (value) {
                if (shouldBlockRedirect(value)) {
                  blockRedirect(value, "document.location.href =");
                  return;
                }
                originalSetter.call(this, value);
              },
              configurable: true,
              enumerable: true,
            });
          }
        }
      }
    } catch (error) {
      console.warn("[pwcrowbar] Could not intercept document.location", error);
    }
  }

  function setupInterceptors() {
    console.log("[pwcrowbar] Setting up interceptors in MAIN context...");
    
    try {
      interceptLocationHref();
      interceptLocationMethods();
      interceptHistory();
      interceptWindowOpen();
      interceptDocumentLocation();
      console.log("[pwcrowbar] ✅ Interceptors set up successfully");
    } catch (error) {
      console.error("[pwcrowbar] Failed to setup interceptors", error);
    }
  }


  function interceptNavigationEvents() {
    window.addEventListener("beforeunload", (event) => {
      const targetUrl = window.location.href;
      if (shouldBlockRedirect(targetUrl)) {
        console.log(`[pwcrowbar] ⚠️ BLOCKING navigation to: ${targetUrl}`);
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.returnValue = "Navigation blocked by Redirect Blocker";
        return event.returnValue;
      }
    }, { capture: true });

    window.addEventListener("popstate", (event) => {
      const targetUrl = window.location.href;
      if (shouldBlockRedirect(targetUrl)) {
        console.log(`[pwcrowbar] ⚠️ Blocking popstate navigation to: ${targetUrl}`);
        history.back();
      }
    }, { capture: true });
  }

  function monitorUrlChanges() {
    let lastUrl = window.location.href;
    let lastHostname = window.location.hostname;
    let lastPathname = window.location.pathname;
    let isBlocking = false;
    
    function checkUrl() {
      try {
        if (isBlocking) return;
        
        const currentUrl = window.location.href;
        const currentHostname = window.location.hostname;
        const currentPathname = window.location.pathname;
        
        if (currentHostname !== lastHostname || currentPathname !== lastPathname) {
          if (shouldBlockRedirect(currentUrl)) {
            console.log(`[pwcrowbar] ⚠️ BLOCKING redirect to: ${currentUrl}`);
            isBlocking = true;
            
            try {
              window.stop();
              const revertUrl = lastUrl;
              window.history.replaceState(null, "", revertUrl);
              
              setTimeout(() => {
                try {
                  window.location.replace(revertUrl);
                } catch (e) {
                  console.error("[pwcrowbar] location.replace failed", e);
                }
                isBlocking = false;
              }, 50);
              
            } catch (error) {
              console.error("[pwcrowbar] Failed to revert URL", error);
              isBlocking = false;
            }
          } else {
            lastUrl = currentUrl;
            lastHostname = currentHostname;
            lastPathname = currentPathname;
          }
        } else if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
        }
      } catch (error) {
        console.warn("[pwcrowbar] Error monitoring URL changes", error);
      }
    }
    
    setInterval(checkUrl, 500);
  }

  function interceptTopLocation() {
    try {
      if (window.top && window.top !== window) {
        const originalTopLocation = window.top.location;
        Object.defineProperty(window.top, "location", {
          get: function () {
            return originalTopLocation;
          },
          set: function (value) {
            if (shouldBlockRedirect(value)) {
              blockRedirect(value, "window.top.location =");
              return;
            }
            if (typeof value === "string") {
              originalTopLocation.href = value;
            }
          },
          configurable: true,
          enumerable: true,
        });
      }
    } catch (error) {
      console.warn("[pwcrowbar] Could not intercept window.top.location (may be cross-origin)", error);
    }
  }

  function init() {
    console.log("[pwcrowbar] Injected script initialized in MAIN context");
    loadRules();
    setupInterceptors();
    interceptTopLocation();
    interceptNavigationEvents();
    monitorUrlChanges();

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "PWCROWBAR_UPDATE_RULES") {
        const rulesData = event.data.rules || [];
        redirectRules = rulesData
          .map((pattern) => {
            try {
              return new RegExp(pattern);
            } catch (error) {
              return null;
            }
          })
          .filter(Boolean);
        window[PWCROWBAR_KEY] = redirectRules;
        console.log(`[pwcrowbar] Updated ${redirectRules.length} redirect rules`);
      }
    });
  }

  init();
})();

