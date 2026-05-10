import { describe, expect, it } from "vitest";
import {
  normalizeMarkdownInlineImageUrlsToRelative,
  resolvePaperclipPublicAssetUrl,
  rewriteMarkdownInlineImageUrlsToAbsolute,
} from "./paperclip-public-url";

describe("resolvePaperclipPublicAssetUrl", () => {
  it("returns absolute Paperclip URL for /api paths when base is set", () => {
    expect(resolvePaperclipPublicAssetUrl("/api/assets/x/content", "http://127.0.0.1:38473")).toBe(
      "http://127.0.0.1:38473/api/assets/x/content",
    );
  });

  it("strips trailing slash on base", () => {
    expect(resolvePaperclipPublicAssetUrl("/api/hi", "http://127.0.0.1:38473/")).toBe(
      "http://127.0.0.1:38473/api/hi",
    );
  });

  it("leaves non-api and absolute URLs unchanged when base is set", () => {
    expect(resolvePaperclipPublicAssetUrl("https://example.com/a.png", "http://127.0.0.1:38473")).toBe(
      "https://example.com/a.png",
    );
    expect(resolvePaperclipPublicAssetUrl("/static/x", "http://127.0.0.1:38473")).toBe("/static/x");
  });

  it("returns src unchanged when base is missing", () => {
    expect(resolvePaperclipPublicAssetUrl("/api/x", null)).toBe("/api/x");
    expect(resolvePaperclipPublicAssetUrl("/api/x", undefined)).toBe("/api/x");
  });
});

describe("rewriteMarkdownInlineImageUrlsToAbsolute", () => {
  it("rewrites inline /api/ image markdown", () => {
    expect(
      rewriteMarkdownInlineImageUrlsToAbsolute("![](/api/assets/a/content)", "http://127.0.0.1:38473"),
    ).toBe("![](http://127.0.0.1:38473/api/assets/a/content)");
  });

  it("preserves optional title part", () => {
    expect(
      rewriteMarkdownInlineImageUrlsToAbsolute(
        '![x](/api/hi "t")',
        "http://127.0.0.1:38473",
      ),
    ).toBe('![x](http://127.0.0.1:38473/api/hi "t")');
  });
});

describe("normalizeMarkdownInlineImageUrlsToRelative", () => {
  it("strips same-origin absolute URLs in image markdown", () => {
    expect(
      normalizeMarkdownInlineImageUrlsToRelative(
        "![](http://127.0.0.1:38473/api/x)",
        "http://127.0.0.1:38473",
      ),
    ).toBe("![](/api/x)");
  });

  it("leaves other origins alone", () => {
    expect(
      normalizeMarkdownInlineImageUrlsToRelative(
        "![](https://example.com/a.png)",
        "http://127.0.0.1:38473",
      ),
    ).toBe("![](https://example.com/a.png)");
  });
});
