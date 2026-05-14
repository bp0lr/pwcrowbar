function basicShape(rule) {
  return {
    id: rule.id ?? crypto.randomUUID(),
    domainPattern: typeof rule.domainPattern === "string" ? rule.domainPattern.trim() : "",
  };
}

export function normalizeResourceRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule) => ({
      ...basicShape(rule),
      filePatterns: Array.isArray(rule.filePatterns)
        ? rule.filePatterns.map((pattern) => pattern.trim()).filter(Boolean)
        : [],
    }))
    .filter((rule) => rule.domainPattern && rule.filePatterns.length);
}

export function normalizeRedirectRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(basicShape)
    .filter((rule) => rule.domainPattern);
}
