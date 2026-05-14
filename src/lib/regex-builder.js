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

export function buildRegexFilter(domainPattern, filePattern) {
  if (!isValidRegex(filePattern)) return null;

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
  return isValidRegex(combined) ? combined : null;
}

export function buildRedirectRegexFilter(domainPattern) {
  const sanitizedDomain = stripRegexDelimiters(domainPattern);
  if (!sanitizedDomain) return null;

  let domainSegment = sanitizedDomain;
  if (!sanitizedDomain.startsWith("^")) {
    if (sanitizedDomain.includes("(^|")) {
      const patternToReplace = sanitizedDomain.match(/\([^)]+\)/)?.[0];
      if (patternToReplace && patternToReplace.includes("^|")) {
        domainSegment = sanitizedDomain.replace(patternToReplace, "(?:[^/]*\\.)?");
      }
    }
    domainSegment = domainSegment.replace(/\$$/, "");
  }

  const fullRegex = `^https?://${domainSegment}(?:/.*)?$`;
  return isValidRegex(fullRegex) ? fullRegex : null;
}
