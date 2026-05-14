import {
  buildRegexFilter,
  buildRedirectRegexFilter,
  isValidRegex,
} from "./lib/regex-builder.js";

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
    if (!isValidRegex(rule.domainPattern)) {
      console.warn(`[pwcrowbar] Skipped invalid domain regex (${rule.domainPattern})`);
      return;
    }

    rule.filePatterns.forEach((filePattern) => {
      const regexFilter = buildRegexFilter(rule.domainPattern, filePattern);
      if (!regexFilter) {
        console.warn(`[pwcrowbar] Skipped rule with invalid file regex (${filePattern})`);
        return;
      }

      dynamicRules.push({
        id: nextId++,
        priority: 1,
        action: { type: "block" },
        condition: {
          regexFilter,
          resourceTypes: RESOURCE_TYPES,
        },
      });
    });
  });

  redirectRules.forEach((rule) => {
    const regexFilter = buildRedirectRegexFilter(rule.domainPattern);
    if (!regexFilter) {
      console.warn(`[pwcrowbar] Skipped invalid redirect rule (${rule.domainPattern})`);
      return;
    }

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

