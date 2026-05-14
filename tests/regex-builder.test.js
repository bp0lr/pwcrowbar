import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegexFilter,
  buildRedirectRegexFilter,
  stripRegexDelimiters,
  isValidRegex,
} from "../src/lib/regex-builder.js";

describe("stripRegexDelimiters", () => {
  test("returns falsy for null/empty input", () => {
    assert.equal(stripRegexDelimiters(null), null);
    assert.equal(stripRegexDelimiters(""), "");
    assert.equal(stripRegexDelimiters(undefined), undefined);
  });

  test("strips surrounding slashes", () => {
    assert.equal(stripRegexDelimiters("/foo/"), "foo");
  });

  test("does not strip a single leading slash", () => {
    assert.equal(stripRegexDelimiters("/foo"), "/foo");
  });

  test("trims whitespace", () => {
    assert.equal(stripRegexDelimiters("  foo  "), "foo");
  });
});

describe("isValidRegex", () => {
  test("returns true for valid patterns", () => {
    assert.ok(isValidRegex(".*"));
    assert.ok(isValidRegex("(foo|bar)+"));
  });

  test("returns false for invalid patterns", () => {
    assert.ok(!isValidRegex("["));
    assert.ok(!isValidRegex("(unclosed"));
  });

  test("returns false for empty/null", () => {
    assert.ok(!isValidRegex(""));
    assert.ok(!isValidRegex(null));
  });
});

describe("buildRegexFilter — basics", () => {
  test("returns null for invalid file pattern", () => {
    assert.equal(buildRegexFilter("example\\.com", "["), null);
  });

  test("returns null for empty inputs", () => {
    assert.equal(buildRegexFilter("", "foo"), null);
    assert.equal(buildRegexFilter("foo", ""), null);
  });

  test("plain domain + plain file matches the URL", () => {
    const re = new RegExp(buildRegexFilter("example\\.com", "tracker\\.js$"));
    assert.ok(re.test("https://example.com/tracker.js"));
    assert.ok(re.test("https://cdn.example.com/path/tracker.js"));
    assert.ok(!re.test("https://example.com/other.js"));
  });
});

describe("buildRegexFilter — regression: trailing $ on domain (else branch)", () => {
  test("domain ending in $ still matches when path follows", () => {
    const filter = buildRegexFilter(".*\\.example\\.net$", ".*\\/foo\\/bar\\.js(\\?.*)?$");
    assert.ok(filter, "filter should be built");
    const re = new RegExp(filter);
    assert.ok(re.test("https://sub.example.net/foo/bar.js"));
    assert.ok(re.test("https://sub.example.net/foo/bar.js?v=1"));
  });

  test("plain trailing $ does not break the regex", () => {
    const filter = buildRegexFilter("example\\.com$", "foo\\.js$");
    const re = new RegExp(filter);
    assert.ok(re.test("https://example.com/foo.js"));
  });
});

describe("buildRegexFilter — regression: leading .*\\/ in file pattern (optional separator)", () => {
  test("file at root path matches when file pattern includes leading slash via .*\\/", () => {
    const re = new RegExp(buildRegexFilter(".*\\.example\\.net$", ".*\\/foo\\/bar\\.js$"));
    assert.ok(re.test("https://x.example.net/foo/bar.js"), "root /foo/bar.js should match");
  });

  test("file at deep path also matches", () => {
    const re = new RegExp(buildRegexFilter(".*\\.example\\.net$", ".*\\/foo\\/bar\\.js$"));
    assert.ok(re.test("https://x.example.net/some/deep/foo/bar.js"));
  });

  test("non-matching path does not match", () => {
    const re = new RegExp(buildRegexFilter(".*\\.example\\.net$", ".*\\/foo\\/bar\\.js$"));
    assert.ok(!re.test("https://x.example.net/baz.js"));
  });
});

describe("buildRegexFilter — (^|.) subdomain wildcard", () => {
  test("matches apex and subdomains", () => {
    const re = new RegExp(buildRegexFilter("(^|\\.)example\\.com$", "/tracker\\.js$"));
    assert.ok(re.test("https://example.com/tracker.js"));
    assert.ok(re.test("https://www.example.com/tracker.js"));
    assert.ok(re.test("https://cdn.assets.example.com/tracker.js"));
  });

  test("does not match unrelated TLDs that happen to contain the string", () => {
    const re = new RegExp(buildRegexFilter("(^|\\.)example\\.com$", "/tracker\\.js$"));
    assert.ok(!re.test("https://notexample.com/tracker.js"));
  });
});

describe("buildRegexFilter — leading ^ on domain", () => {
  test("leading ^ is stripped so the regex stays valid", () => {
    const filter = buildRegexFilter("^example\\.com", "/tracker\\.js$");
    assert.ok(filter, "filter must be a valid regex");
    const re = new RegExp(filter);
    assert.ok(re.test("https://example.com/tracker.js"));
  });
});

describe("buildRegexFilter — file pattern variants", () => {
  test("file pattern starting with / is taken as-is", () => {
    const re = new RegExp(buildRegexFilter("example\\.com", "/api/.*\\.js$"));
    assert.ok(re.test("https://example.com/api/foo.js"));
    assert.ok(!re.test("https://example.com/notapi/foo.js"));
  });

  test("file pattern starting with ^ strips the anchor", () => {
    const re = new RegExp(buildRegexFilter("example\\.com", "^/api/foo\\.js$"));
    assert.ok(re.test("https://example.com/api/foo.js"));
  });
});

describe("buildRedirectRegexFilter", () => {
  test("simple domain pattern", () => {
    const re = new RegExp(buildRedirectRegexFilter("example\\.com"));
    assert.ok(re.test("https://example.com/"));
    assert.ok(re.test("https://example.com/path/to/page"));
  });

  test("strips trailing $", () => {
    const re = new RegExp(buildRedirectRegexFilter("example\\.com$"));
    assert.ok(re.test("https://example.com/anything"));
  });

  test("(^|.) subdomain wildcard", () => {
    const re = new RegExp(buildRedirectRegexFilter("(^|\\.)example\\.com$"));
    assert.ok(re.test("https://example.com/"));
    assert.ok(re.test("https://www.example.com/page"));
    assert.ok(!re.test("https://notexample.com/page"));
  });

  test("returns null for empty input", () => {
    assert.equal(buildRedirectRegexFilter(""), null);
    assert.equal(buildRedirectRegexFilter(null), null);
  });
});
