import { describe, expect, it } from "vitest";
import { fmt, xmlEscape, xmlUnescape } from "../xml-utils.js";

describe("xmlEscape", () => {
  it("escapes &, <, >, \", '", () => {
    expect(xmlEscape(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f"
    );
  });

  it("handles null/undefined as empty string", () => {
    expect(xmlEscape(null)).toBe("");
    expect(xmlEscape(undefined)).toBe("");
  });

  it("converts numbers to strings", () => {
    expect(xmlEscape(42)).toBe("42");
  });

  it("leaves safe characters untouched", () => {
    expect(xmlEscape("hello world")).toBe("hello world");
  });
});

describe("xmlUnescape", () => {
  it("reverses xmlEscape", () => {
    const original = `Jan & Co <test> "quoted" 't'`;
    expect(xmlUnescape(xmlEscape(original))).toBe(original);
  });

  it("does not double-unescape &amp;lt;", () => {
    // &amp;lt; should become &lt;, NOT <
    expect(xmlUnescape("&amp;lt;")).toBe("&lt;");
  });

  it("unescapes all five entities", () => {
    expect(xmlUnescape("&lt;&gt;&quot;&apos;&amp;")).toBe(`<>"'&`);
  });
});

describe("fmt", () => {
  it("formats with given decimals", () => {
    expect(fmt(3.14159, 2)).toBe("3.14");
    expect(fmt(1, 4)).toBe("1.0000");
  });

  it("treats undefined as 0", () => {
    expect(fmt(undefined, 2)).toBe("0.00");
  });
});
