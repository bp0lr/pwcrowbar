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
const REDIRECT_RESOURCE_TYPES = ["main_frame", "sub_frame"];

const MAX_DYNAMIC_RULES =
  chrome.declarativeNetRequest?.MAX_NUMBER_OF_DYNAMIC_RULES ?? 5000;
const MAX_REGEX_RULES =
  chrome.declarativeNetRequest?.MAX_NUMBER_OF_REGEX_RULES ?? 1000;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultRules();
  await queueRebuild();
});

chrome.runtime.onStartup.addListener(() => queueRebuild());

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && (changes.rules || changes.redirectRules)) {
    queueRebuild();
  }
});

let pendingBuild = Promise.resolve();
function queueRebuild() {
  pendingBuild = pendingBuild
    .catch(() => {})
    .then(() => rebuildDynamicRules());
  return pendingBuild;
}

async function ensureDefaultRules() {
  const { rules, redirectRules } = await chrome.storage.sync.get([
    "rules",
    "redirectRules",
  ]);

  const updates = {};
  if (!Array.isArray(rules)) updates.rules = DEFAULT_RESOURCE_RULES;
  if (!Array.isArray(redirectRules)) updates.redirectRules = DEFAULT_REDIRECT_RULES;
  if (Object.keys(updates).length) await chrome.storage.sync.set(updates);
}

async function rebuildDynamicRules() {
  const status = { ok: true, added: 0, removed: 0, unchanged: 0, skipped: [], error: null };
  try {
    const { rules = DEFAULT_RESOURCE_RULES, redirectRules = DEFAULT_REDIRECT_RULES } =
      await chrome.storage.sync.get(["rules", "redirectRules"]);

    const desired = buildDynamicRules(
      normalizeResourceRules(rules),
      normalizeRedirectRules(redirectRules),
      status.skipped
    );

    const overLimit = checkLimits(desired);
    if (overLimit) {
      status.ok = false;
      status.error = overLimit;
      console.warn(`[pwcrowbar] ${overLimit}`);
      await saveStatus(status);
      return status;
    }

    const result = await reconcile(desired);
    Object.assign(status, result);
    console.info(
      `[pwcrowbar] DNR reconciled: +${result.added} -${result.removed} =${result.unchanged} (${result.added + result.unchanged} active)`
    );
  } catch (error) {
    status.ok = false;
    status.error = error?.message || String(error);
    console.error("[pwcrowbar] rebuild failed", error);
  }
  await saveStatus(status);
  return status;
}

function checkLimits(desired) {
  if (desired.length > MAX_DYNAMIC_RULES) {
    return `Rule count (${desired.length}) exceeds DNR dynamic limit (${MAX_DYNAMIC_RULES}).`;
  }
  const regexCount = desired.filter((r) => r.condition.regexFilter).length;
  if (regexCount > MAX_REGEX_RULES) {
    return `Regex rule count (${regexCount}) exceeds DNR regex limit (${MAX_REGEX_RULES}).`;
  }
  return null;
}

async function reconcile(desired) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleKey = (r) => `${r.priority}|${r.condition.regexFilter}`;

  const existingByKey = new Map(existing.map((r) => [ruleKey(r), r]));
  const desiredByKey = new Map(desired.map((r) => [ruleKey(r), r]));

  const removeRuleIds = [];
  for (const [key, rule] of existingByKey) {
    if (!desiredByKey.has(key)) removeRuleIds.push(rule.id);
  }

  const reservedIds = new Set(
    existing.filter((r) => desiredByKey.has(ruleKey(r))).map((r) => r.id)
  );
  let nextId = 1;
  const allocId = () => {
    while (reservedIds.has(nextId)) nextId++;
    return nextId++;
  };

  const addRules = [];
  for (const [key, rule] of desiredByKey) {
    if (existingByKey.has(key)) continue;
    addRules.push({ ...rule, id: allocId() });
  }

  if (removeRuleIds.length || addRules.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });
  }

  return {
    added: addRules.length,
    removed: removeRuleIds.length,
    unchanged: desired.length - addRules.length,
  };
}

async function saveStatus(status) {
  try {
    await chrome.storage.local.set({
      pwcrowbarStatus: { ...status, at: Date.now() },
    });
  } catch (error) {
    console.warn("[pwcrowbar] failed to persist status", error);
  }
}

function normalizeResourceRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule) => ({
      id: rule.id ?? crypto.randomUUID(),
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
      id: rule.id ?? crypto.randomUUID(),
      domainPattern: typeof rule.domainPattern === "string" ? rule.domainPattern.trim() : "",
    }))
    .filter((rule) => rule.domainPattern);
}

function buildDynamicRules(resourceRules, redirectRules, skipped = []) {
  const dynamicRules = [];

  resourceRules.forEach((rule) => {
    if (!isValidRegex(rule.domainPattern)) {
      skipped.push({ rule: rule.id, reason: `invalid domain regex: ${rule.domainPattern}` });
      return;
    }
    rule.filePatterns.forEach((filePattern) => {
      const regexFilter = buildRegexFilter(rule.domainPattern, filePattern);
      if (!regexFilter) {
        skipped.push({ rule: rule.id, reason: `invalid file regex: ${filePattern}` });
        return;
      }
      dynamicRules.push({
        priority: 1,
        action: { type: "block" },
        condition: { regexFilter, resourceTypes: RESOURCE_TYPES },
      });
    });
  });

  redirectRules.forEach((rule) => {
    const regexFilter = buildRedirectRegexFilter(rule.domainPattern);
    if (!regexFilter) {
      skipped.push({ rule: rule.id, reason: `invalid redirect regex: ${rule.domainPattern}` });
      return;
    }
    dynamicRules.push({
      priority: 100,
      action: { type: "block" },
      condition: { regexFilter, resourceTypes: REDIRECT_RESOURCE_TYPES },
    });
  });

  return dynamicRules;
}
