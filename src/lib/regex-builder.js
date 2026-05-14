export function stripRegexDelimiters(pattern) {
  if (!pattern) return pattern;
  let result = pattern.trim();
  if (result.startsWith("/") && result.endsWith("/")) {
    result = result.slice(1, -1);
  }
  return result;
}

export function isValidRegex(pattern) {
  if (!pattern) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function rewriteSubdomainWildcard(d) {
  const group = d.match(/\([^)]+\)/)?.[0];
  return group?.includes("^|") ? d.replace(group, "(?:[^/]*\\.)?") : d;
}

function resourceDomainBody(d) {
  if (d.startsWith("^")) return d.slice(1);
  const rewritten = rewriteSubdomainWildcard(d);
  return rewritten === d ? `[^/]*?(?:${d})` : rewritten;
}

function pathBody(f) {
  if (f.startsWith("^")) return f.slice(1);
  if (f.startsWith("/")) return f;
  return `.*?(?:${f})`;
}

export function buildRegexFilter(domainPattern, filePattern) {
  if (!isValidRegex(filePattern)) return null;
  const domain = stripRegexDelimiters(domainPattern).replace(/\$$/, "");
  const file = stripRegexDelimiters(filePattern);
  if (!domain || !file) return null;

  const path = pathBody(file);
  const separator = path.startsWith("/") ? "" : "/?";
  const combined = `^https?://${resourceDomainBody(domain)}${separator}${path}`;
  return isValidRegex(combined) ? combined : null;
}

export function buildRedirectRegexFilter(domainPattern) {
  const domain = stripRegexDelimiters(domainPattern);
  if (!domain) return null;

  const body = domain.startsWith("^")
    ? domain.slice(1)
    : rewriteSubdomainWildcard(domain).replace(/\$$/, "");

  const full = `^https?://${body}(?:/.*)?$`;
  return isValidRegex(full) ? full : null;
}
