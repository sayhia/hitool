import { describe, expect, it } from "vitest";
import { escapeHtml, render, slugify, toPlainText } from "./markdown";

const html = (src: string) => render(src).html;

describe("escaping", () => {
  it("escapes every angle bracket in the source", () => {
    expect(escapeHtml('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
  });

  it("never passes raw HTML through", () => {
    // The whole safety promise: this renders inside the app's own window.
    const out = html("Hello <script>alert(1)</script> world");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes an attribute-style injection too", () => {
    // The escaped text still *reads* "onerror=", which is the point — it is
    // visible characters rather than an attribute. What must not exist is a
    // live element, so that is what the assertion checks.
    const out = html('text <img src=x onerror="alert(1)"> more');
    expect(out).not.toMatch(/<img\b/);
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes inside code spans and fences", () => {
    expect(html("`<b>`")).toContain("<code>&lt;b&gt;</code>");
    expect(html("```\n<b>\n```")).toContain("&lt;b&gt;");
  });
});

describe("links", () => {
  it("renders a normal link", () => {
    expect(html("[docs](https://example.com)")).toContain('<a href="https://example.com">docs</a>');
  });

  it("keeps relative and anchor links", () => {
    expect(html("[a](./x.md)")).toContain('href="./x.md"');
    expect(html("[a](#section)")).toContain('href="#section"');
  });

  it("refuses a javascript: target", () => {
    // However it is spelled, it must not become a live link.
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<x>"]) {
      const out = html(`[click](${bad})`);
      expect(out, bad).not.toContain("<a href");
    }
  });

  it("renders an image", () => {
    expect(html("![alt](https://e.com/a.png)")).toContain(
      '<img src="https://e.com/a.png" alt="alt" loading="lazy">',
    );
  });

  it("refuses an unsafe image source", () => {
    expect(html("![x](javascript:alert(1))")).not.toContain("<img");
  });

  it("links a bare URL", () => {
    expect(html("see https://example.com/x now")).toContain(
      '<a href="https://example.com/x">https://example.com/x</a>',
    );
  });
});

describe("inline", () => {
  it("renders emphasis", () => {
    expect(html("**bold**")).toContain("<strong>bold</strong>");
    expect(html("*it*")).toContain("<em>it</em>");
    expect(html("_it_")).toContain("<em>it</em>");
    expect(html("***both***")).toContain("<strong><em>both</em></strong>");
    expect(html("~~gone~~")).toContain("<del>gone</del>");
  });

  it("leaves markup inside a code span alone", () => {
    // An example of `**bold**` must not actually be bold.
    const out = html("use `**bold**` for emphasis");
    expect(out).toContain("<code>**bold**</code>");
    expect(out).not.toContain("<strong>bold</strong>");
  });

  it("does not treat an underscore inside a word as emphasis", () => {
    expect(html("snake_case_name")).not.toContain("<em>");
  });

  it("handles a code span containing backticks", () => {
    expect(html("``a ` b``")).toContain("<code>a ` b</code>");
  });

  it("turns two trailing spaces into a break", () => {
    expect(html("one  \ntwo")).toContain("<br>");
  });
});

describe("blocks", () => {
  it("renders headings with anchors", () => {
    const r = render("# Title\n## Sub");
    expect(r.html).toContain('<h1 id="title">Title</h1>');
    expect(r.html).toContain('<h2 id="sub">Sub</h2>');
    expect(r.headings).toEqual([
      { level: 1, text: "Title", id: "title" },
      { level: 2, text: "Sub", id: "sub" },
    ]);
  });

  it("keeps CJK in an anchor rather than emptying it", () => {
    const r = render("## 安装说明");
    expect(r.headings[0].id).toBe("安装说明");
  });

  it("disambiguates repeated headings", () => {
    const r = render("# A\n# A");
    expect(r.headings.map((h) => h.id)).toEqual(["a", "a-1"]);
  });

  it("renders a fenced block with its language", () => {
    expect(html("```go\nfmt.Println()\n```")).toContain('<code class="language-go">');
  });

  it("closes an unterminated fence at the end of the document", () => {
    const out = html("```\nstill code");
    expect(out).toContain("<pre><code>still code</code></pre>");
  });

  it("renders lists", () => {
    expect(html("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(html("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("honours a list that does not start at one", () => {
    expect(html("3. c\n4. d")).toContain('<ol start="3">');
  });

  it("nests a deeper list inside the item above it", () => {
    const out = html("- a\n  - a1\n- b");
    expect(out).toBe("<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>");
  });

  it("renders task list items", () => {
    const out = html("- [x] done\n- [ ] todo");
    expect(out).toContain('<input type="checkbox" disabled checked>');
    expect(out).toContain('<input type="checkbox" disabled>');
  });

  it("renders a blockquote, parsing what is inside it", () => {
    expect(html("> **hi**")).toBe("<blockquote><p><strong>hi</strong></p></blockquote>");
  });

  it("renders a horizontal rule", () => {
    for (const rule of ["---", "***", "___", "- - -"]) expect(html(rule), rule).toBe("<hr>");
  });

  it("does not mistake a setext-ish line for a rule inside a paragraph", () => {
    expect(html("text\n\n---")).toBe("<p>text</p>\n<hr>");
  });

  it("joins the lines of a paragraph", () => {
    expect(html("one\ntwo")).toBe("<p>one\ntwo</p>");
  });

  it("separates paragraphs on a blank line", () => {
    expect(html("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
  });
});

describe("tables", () => {
  it("renders a table", () => {
    const out = html("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(out).toContain("<th>a</th><th>b</th>");
    expect(out).toContain("<td>1</td><td>2</td>");
  });

  it("applies column alignment", () => {
    const out = html("| l | c | r |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |");
    expect(out).toContain('style="text-align:left"');
    expect(out).toContain('style="text-align:center"');
    expect(out).toContain('style="text-align:right"');
  });

  it("pads a short row instead of dropping the column", () => {
    const out = html("| a | b |\n| --- | --- |\n| 1 |");
    expect(out).toContain("<td>1</td><td></td>");
  });

  it("leaves a pipe-containing paragraph alone without a separator row", () => {
    expect(html("a | b")).toBe("<p>a | b</p>");
  });
});

describe("render — whole documents", () => {
  it("handles an empty document", () => {
    expect(html("")).toBe("");
    expect(html("   \n\n  ")).toBe("");
  });

  it("normalises CRLF", () => {
    expect(html("# a\r\n\r\nb")).toBe('<h1 id="a">a</h1>\n<p>b</p>');
  });

  it("survives a document that mixes everything", () => {
    const doc = [
      "# Title",
      "",
      "Some **bold** and `code`.",
      "",
      "- one",
      "- two",
      "",
      "> quoted",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");
    const out = html(doc);
    for (const frag of ["<h1", "<strong>", "<code>", "<ul>", "<blockquote>", "<pre>", "<table>"]) {
      expect(out, frag).toContain(frag);
    }
  });

  it("never emits an unescaped angle bracket that was not markup", () => {
    const out = html("a < b and c > d, 5 <= 6");
    expect(out).not.toMatch(/<(?!\/?(p|em|strong|code|a|br)\b)/);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Getting Started")).toBe("getting-started");
  });

  it("drops punctuation but keeps letters and digits", () => {
    expect(slugify("What's new in v2.0?")).toBe("whats-new-in-v20");
  });

  it("falls back rather than returning an empty anchor", () => {
    expect(slugify("!!!")).toBe("section");
    expect(slugify("")).toBe("section");
  });
});

describe("toPlainText", () => {
  it("strips the markup", () => {
    expect(toPlainText("# Title\n\nSome **bold** text.")).toBe("Title Some bold text.");
  });

  it("brings escaped characters back", () => {
    expect(toPlainText("a < b & c")).toBe("a < b & c");
  });
});
