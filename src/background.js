const DEFAULT_RESOURCE_RULES = [];
const DEFAULT_REDIRECT_RULES = [];
const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "other",
];

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultRules();
  await rebuildDynamicRules();
});

chrome.runtime.onStartup.addListener(rebuildDynamicRules);

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "sync" && (changes.rules || changes.redirectRules)) {
    await rebuildDynamicRules();
  }
});

async function ensureDefaultRules() {
  const { rules, redirectRules } = await chrome.storage.sync.get([
    "rules",
    "redirectRules",
  ]);

  const updates = {};
  if (!Array.isArray(rules)) {
    updates.rules = DEFAULT_RESOURCE_RULES;
  }
  if (!Array.isArray(redirectRules)) {
    updates.redirectRules = DEFAULT_REDIRECT_RULES;
  }

  if (Object.keys(updates).length) {
    await chrome.storage.sync.set(updates);
  }
}

async function rebuildDynamicRules() {
  try {
    const { rules = DEFAULT_RESOURCE_RULES, redirectRules = DEFAULT_REDIRECT_RULES } =
      await chrome.storage.sync.get(["rules", "redirectRules"]);

    const normalizedResources = normalizeResourceRules(rules);
    const normalizedRedirects = normalizeRedirectRules(redirectRules);
    const dynamicRules = buildDynamicRules(normalizedResources, normalizedRedirects);

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((rule) => rule.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: dynamicRules,
    });

    const redirectRuleCount = dynamicRules.filter(r => r.condition.resourceTypes?.includes("main_frame")).length;
    const resourceRuleCount = dynamicRules.length - redirectRuleCount;
    
    console.info(`[pwcrowbar] Dynamic rules updated:`);
    console.info(`  - Resource blocking rules: ${resourceRuleCount}`);
    console.info(`  - Redirect blocking rules: ${redirectRuleCount}`);
    console.info(`  - Total rules: ${dynamicRules.length}`);
  } catch (error) {
    console.error("Failed to update dynamic rules", error);
  }
}

function normalizeResourceRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule) => ({
      id: rule.id ?? crypto.randomUUID?.() ?? String(Date.now()),
      domainPattern: typeof rule.domainPattern === "string" ? rule.domainPattern.trim() : "",
      filePatterns: Array.isArray(rule.filePatterns)
        ? rule.filePatterns.map((pattern) => pattern.trim()).filter(Boolean)
        : [],
    }))
    .filter((rule) => rule.domainPattern && rule.filePatterns.length);
}

function normalizeRedirectRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule) => ({
      id: rule.id ?? crypto.randomUUID?.() ?? String(Date.now()),
      domainPattern: typeof rule.domainPattern === "string" ? rule.domainPattern.trim() : "",
    }))
    .filter((rule) => rule.domainPattern);
}

function buildDynamicRules(resourceRules, redirectRules) {
  let nextId = 1;
  const dynamicRules = [];

  resourceRules.forEach((rule) => {
    const domainValid = isValidRegex(rule.domainPattern);
    if (!domainValid) {
      console.warn(`Skipped invalid domain regex (${rule.domainPattern})`);
      return;
    }

    rule.filePatterns.forEach((filePattern) => {
      const combinedRegex = buildRegexFilter(rule.domainPattern, filePattern);
      if (!combinedRegex) return;

      if (!isValidRegex(combinedRegex)) {
        console.warn(`Skipped invalid combined regex (${combinedRegex})`);
        return;
      }

      dynamicRules.push({
        id: nextId++,
        priority: 1,
        action: { type: "block" },
        condition: {
          regexFilter: combinedRegex,
          resourceTypes: RESOURCE_TYPES,
        },
      });
    });
  });

  redirectRules.forEach((rule) => {
    if (!isValidRegex(rule.domainPattern)) {
      console.warn(`Skipped invalid redirect regex (${rule.domainPattern})`);
      return;
    }

    const regexFilter = buildRedirectRegexFilter(rule.domainPattern);
    if (!regexFilter) {
      console.warn(`Failed to build regex filter for: ${rule.domainPattern}`);
      return;
    }

    if (!isValidRegex(regexFilter)) {
      console.warn(`Skipped invalid combined redirect regex (${regexFilter})`);
      return;
    }

    console.log(`[pwcrowbar] Creating redirect block rule: ${regexFilter}`);

    dynamicRules.push({
      id: nextId++,
      priority: 100,
      action: { type: "block" },
      condition: {
        regexFilter,
        resourceTypes: ["main_frame", "sub_frame"],
      },
    });
  });

  return dynamicRules;
}

function buildRegexFilter(domainPattern, filePattern) {
  if (!isValidRegex(filePattern)) {
    console.warn(`Skipped invalid file regex (${filePattern})`);
    return null;
  }

  const sanitizedDomain = stripRegexDelimiters(domainPattern).replace(/\$$/, "");
  const sanitizedFile = stripRegexDelimiters(filePattern);

  if (!sanitizedDomain || !sanitizedFile) return null;

  let domainSegment;
  if (sanitizedDomain.startsWith("^")) {
    domainSegment = `^https?://${sanitizedDomain.slice(1)}`;
  } else if (sanitizedDomain.includes("(^|")) {
    const patternToReplace = sanitizedDomain.match(/\([^)]+\)/)?.[0];
    if (patternToReplace && patternToReplace.includes("^|")) {
      const processedDomain = sanitizedDomain.replace(patternToReplace, "(?:[^/]*\\.)?");
      domainSegment = `^https?://${processedDomain}`;
    } else {
      domainSegment = `^https?://[^/]*?(?:${sanitizedDomain})`;
    }
  } else {
    domainSegment = `^https?://[^/]*?(?:${sanitizedDomain})`;
  }

  let pathSegment;
  if (sanitizedFile.startsWith("^")) {
    pathSegment = sanitizedFile.slice(1);
  } else if (sanitizedFile.startsWith("/")) {
    pathSegment = sanitizedFile;
  } else {
    pathSegment = `.*?(?:${sanitizedFile})`;
  }

  const needsSlash = !pathSegment.startsWith("/");
  const combined = `${domainSegment}${needsSlash ? "/?" : ""}${pathSegment}`;

  console.log(`[pwcrowbar] Built resource regex: domain="${domainPattern}", file="${filePattern}" → ${combined}`);

  return combined;
}

function buildRedirectRegexFilter(domainPattern) {
  const sanitizedDomain = stripRegexDelimiters(domainPattern);
  if (!sanitizedDomain) return null;
  
  let domainSegment = sanitizedDomain;
  
  if (sanitizedDomain.startsWith("^")) {
    domainSegment = sanitizedDomain;
  } else {
    if (sanitizedDomain.includes("(^|")) {
      const patternToReplace = sanitizedDomain.match(/\([^)]+\)/)?.[0];
      if (patternToReplace && patternToReplace.includes("^|")) {
        domainSegment = sanitizedDomain.replace(patternToReplace, "(?:[^/]*\\.)?");
      }
    }
    domainSegment = domainSegment.replace(/\$$/, "");
  }
  
  const fullRegex = `^https?://${domainSegment}(?:/.*)?$`;
  
  if (!isValidRegex(fullRegex)) {
    console.error(`[pwcrowbar] Invalid regex generated for "${domainPattern}": ${fullRegex}`);
    console.error(`[pwcrowbar] Original sanitized: "${sanitizedDomain}"`);
    return null;
  }
  
  console.log(`[pwcrowbar] Built regex for "${domainPattern}": ${fullRegex}`);
  
  return fullRegex;
}

function stripRegexDelimiters(pattern) {
  if (!pattern) return pattern;
  let result = pattern.trim();
  if (result.startsWith("/") && result.endsWith("/")) {
    result = result.slice(1, -1);
  }
  return result;
}

function isValidRegex(pattern) {
  if (!pattern) return false;
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch (_error) {
    return false;
  }
}
