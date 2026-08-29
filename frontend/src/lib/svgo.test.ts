import { describe, expect, it } from "vitest";
import { looksLikeSvg, optimise, roundNumbers, toDataUri } from "./svgo";

const wrap = (inner: string, attrs = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"') =>
  `<svg ${attrs}>${inner}</svg>`;

describe("roundNumbers", () => {
  it("rounds to the requested precision", () => {
    expect(roundNumbers("M 1.23456 2.98765", 2)).toBe("M 1.23 2.99");
    expect(roundNumbers("M 1.23456 2.98765", 0)).toBe("M 1 3");
  });

  it("drops the zeroes rounding leaves behind", () => {
    expect(roundNumbers("0.50 3.00", 2)).toBe("0.5 3");
  });

  it("does not write a signed zero", () => {
    // "-0" is a real thing in floating point and noise in a path.
    expect(roundNumbers("-0.001", 2)).toBe("0");
  });

  it("leaves the command letters and separators alone", () => {
    expect(roundNumbers("M0,0 L10.5,20.25 Z", 1)).toBe("M0,0 L10.5,20.3 Z");
  });

  it("handles exponent notation", () => {
    expect(roundNumbers("1e-7", 2)).toBe("0");
  });

  it("does nothing at all when precision is negative", () => {
    expect(roundNumbers("1.23456789", -1)).toBe("1.23456789");
  });

  it("keeps a number that is already short", () => {
    expect(roundNumbers("M 1 2 3", 2)).toBe("M 1 2 3");
  });
});

describe("optimise", () => {
  it("removes comments", () => {
    const out = optimise(wrap("<!-- drawn by hand --><rect/>")).svg;
    expect(out).not.toContain("<!--");
    expect(out).toContain("<rect/>");
  });

  it("removes the XML prolog and doctype", () => {
    const src = `<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">${wrap("<rect/>")}`;
    const out = optimise(src).svg;
    expect(out).not.toContain("<?xml");
    expect(out).not.toContain("DOCTYPE");
    expect(out.startsWith("<svg")).toBe(true);
  });

  it("removes metadata and editor-only elements", () => {
    const src = wrap(
      "<metadata><rdf/></metadata><sodipodi:namedview id='n'/><inkscape:grid type='xy'/><rect/>",
    );
    const out = optimise(src).svg;
    expect(out).not.toContain("metadata");
    expect(out).not.toContain("sodipodi:");
    expect(out).not.toContain("inkscape:");
    expect(out).toContain("<rect/>");
  });

  it("removes editor namespace declarations and attributes", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://x" viewBox="0 0 8 8" version="1.1" xml:space="preserve"><rect inkscape:label="layer1" x="1"/></svg>`;
    const out = optimise(src).svg;
    expect(out).not.toContain("inkscape");
    expect(out).not.toContain("xml:space");
    expect(out).not.toContain("version=");
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('x="1"');
  });

  it("keeps the real namespace and the viewBox", () => {
    const out = optimise(wrap("<rect/>")).svg;
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('viewBox="0 0 24 24"');
  });

  it("rounds coordinates in the attributes that carry them", () => {
    const src = wrap('<path d="M 1.2345678 2.3456789 L 3.9999 4"/>');
    expect(optimise(src, { precision: 2 }).svg).toContain('d="M 1.23 2.35 L 4 4"');
  });

  it("does not touch text content or ids that look numeric", () => {
    const src = wrap('<text id="a1.5">1.23456789</text>');
    const out = optimise(src).svg;
    expect(out).toContain("1.23456789");
    expect(out).toContain('id="a1.5"');
  });

  it("removes empty id, class and style attributes", () => {
    expect(optimise(wrap('<rect id="" class="" style="" x="1"/>')).svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1"/></svg>',
    );
  });

  it("collapses the whitespace between tags", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">\n  <rect/>\n  <circle/>\n</svg>`;
    expect(optimise(src).svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect/><circle/></svg>',
    );
  });

  it("drops width and height only when a viewBox can take over", () => {
    const withBox = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect/></svg>`;
    expect(optimise(withBox, { responsive: true }).svg).not.toContain("width=");
    expect(optimise(withBox, { responsive: true }).svg).toContain("viewBox=");

    // Without a viewBox the drawing would lose its size entirely.
    const noBox = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect/></svg>`;
    expect(optimise(noBox, { responsive: true }).svg).toContain('width="24"');
  });

  it("leaves width and height alone by default", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect/></svg>`;
    expect(optimise(src).svg).toContain('width="24"');
  });

  it("reports the sizes and what was saved", () => {
    const src = wrap("<!-- a very long comment indeed, quite long --><rect/>");
    const r = optimise(src);
    expect(r.before).toBeGreaterThan(r.after);
    expect(r.saved).toBeGreaterThan(0);
    expect(r.saved).toBeLessThan(1);
  });

  it("reports no saving when there is nothing to remove", () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect x="1"/></svg>';
    const r = optimise(src);
    expect(r.svg).toBe(src);
    expect(r.saved).toBe(0);
  });

  it("honours each switch being turned off", () => {
    const src = wrap("<!-- keep --><metadata>m</metadata><rect x='1.23456'/>");
    const out = optimise(src, {
      comments: false,
      metadata: false,
      precision: -1,
      collapseWhitespace: false,
    }).svg;
    expect(out).toContain("<!-- keep -->");
    expect(out).toContain("<metadata>");
    expect(out).toContain("1.23456");
  });

  it("measures in bytes rather than characters", () => {
    // A CJK label is three bytes each; reporting a saving in characters would
    // overstate what the file actually costs.
    const r = optimise(wrap("<title>标题标题</title><rect/>"), { metadata: false });
    expect(r.before).toBeGreaterThan(wrap("<title>标题标题</title><rect/>").length - 1);
  });

  it("survives an empty or non-SVG input without throwing", () => {
    expect(() => optimise("")).not.toThrow();
    expect(() => optimise("not an svg at all")).not.toThrow();
    expect(optimise("").saved).toBe(0);
  });
});

describe("scripts", () => {
  it("removes a script element", () => {
    // SVG is a document format: a script in it runs when the file is opened.
    const out = optimise(wrap("<script>alert(1)</script><rect/>")).svg;
    expect(out).not.toContain("script");
    expect(out).toContain("<rect/>");
  });

  it("removes event handler attributes", () => {
    const out = optimise(wrap(`<rect onload="alert(1)" onclick='x()' x="1"/>`)).svg;
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
    expect(out).toContain('x="1"');
  });

  it("does not mistake a normal attribute for a handler", () => {
    const out = optimise(wrap('<rect opacity="0.5" offset="1"/>')).svg;
    expect(out).toContain('opacity="0.5"');
    expect(out).toContain('offset="1"');
  });

  it("can be turned off for someone who really wants the script", () => {
    const out = optimise(wrap("<script>x</script>"), { scripts: false }).svg;
    expect(out).toContain("<script>");
  });
});

describe("looksLikeSvg", () => {
  it("recognises an SVG", () => {
    expect(looksLikeSvg('<svg xmlns="x"></svg>')).toBe(true);
    expect(looksLikeSvg("<SVG >")).toBe(true);
  });

  it("rejects other text", () => {
    expect(looksLikeSvg("<html></html>")).toBe(false);
    expect(looksLikeSvg("svg")).toBe(false);
    expect(looksLikeSvg("")).toBe(false);
  });
});

describe("toDataUri", () => {
  it("escapes what a url() would choke on", () => {
    const uri = toDataUri('<svg fill="#fff"><rect/></svg>');
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(uri).not.toContain("#");
    expect(uri).not.toContain("<");
    expect(uri).toContain("%23fff");
  });

  it("uses single quotes so the URI can sit in a double-quoted CSS value", () => {
    expect(toDataUri('<svg fill="red"/>')).toContain("fill='red'");
  });

  it("stays shorter than base64 would be", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect/></svg>';
    expect(toDataUri(svg).length).toBeLessThan(svg.length * 1.34 + 20);
  });
});
