import { describe, expect, it } from "vitest";
import {
  decodeLatexEscapes,
  decodeLatexPreviewText,
  domNodeToLatex,
  editableDomToLatex,
  extractLatexSectionTitles,
  extractTemplateHeadings,
  latexBlocksToHtml,
  parseLatexForPreview,
  renderArticleHtml,
  renderInlineLatexHtml,
  serializeDocumentToLatex,
  splitLatexBlocks,
  stripStrayLatexCommands,
} from "./App.jsx";

// ---------------------------------------------------------------------------
// decodeLatexEscapes / decodeLatexPreviewText
// ---------------------------------------------------------------------------

describe("decodeLatexEscapes", () => {
  it("decodes escaped special characters", () => {
    expect(decodeLatexEscapes("50\\% \\& \\#1 \\_var")).toBe("50% & #1 _var");
  });

  it("does not trim, preserving inline fragment boundaries", () => {
    // Regression: an earlier bug trimmed each inline fragment individually,
    // collapsing "This is " + "and " into "Thisisand".
    expect(decodeLatexEscapes("This is ")).toBe("This is ");
    expect(decodeLatexEscapes("and ")).toBe("and ");
  });

  it("converts double-backslash line breaks to newlines", () => {
    expect(decodeLatexEscapes("line one\\\\line two")).toBe("line one\nline two");
  });
});

describe("decodeLatexPreviewText", () => {
  it("decodes and trims for whole-value fields", () => {
    expect(decodeLatexPreviewText("  \\textbackslash{} value  ")).toBe("\\ value");
  });
});

// ---------------------------------------------------------------------------
// renderInlineLatexHtml
// ---------------------------------------------------------------------------

describe("renderInlineLatexHtml", () => {
  it("renders bold/italic/underline/strikethrough/highlight/sup/sub", () => {
    const out = renderInlineLatexHtml(
      "\\textbf{bold} \\textit{italic} \\underline{under} \\sout{gone} \\colorbox{yellow}{hi} \\textsuperscript{sup} \\textsubscript{sub}"
    );
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<u>under</u>");
    expect(out).toContain("<s>gone</s>");
    expect(out).toContain("<mark>hi</mark>");
    expect(out).toContain("<sup>sup</sup>");
    expect(out).toContain("<sub>sub</sub>");
  });

  it("renders inline code via texttt", () => {
    expect(renderInlineLatexHtml("\\texttt{snake_case}")).toContain("<code>");
  });

  it("wraps math spans as non-editable KaTeX-rendered nodes with the source preserved", () => {
    const out = renderInlineLatexHtml("$E = mc^2$");
    expect(out).toContain('class="ngn-math"');
    expect(out).toContain('contenteditable="false"');
    expect(out).toContain('data-latex="E = mc^2"');
  });

  it("escapes raw HTML-significant characters in plain text", () => {
    expect(renderInlineLatexHtml("<script>")).not.toContain("<script>");
  });
});

// ---------------------------------------------------------------------------
// splitLatexBlocks / latexBlocksToHtml
// ---------------------------------------------------------------------------

describe("splitLatexBlocks / latexBlocksToHtml", () => {
  it("renders itemize as ul>li", () => {
    const html = latexBlocksToHtml("\\begin{itemize}\\item One\\item Two\\end{itemize}");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>One</li>");
    expect(html).toContain("<li>Two</li>");
  });

  it("renders enumerate as ol>li", () => {
    const html = latexBlocksToHtml("\\begin{enumerate}\\item First\\end{enumerate}");
    expect(html).toContain("<ol>");
  });

  it("renders tabular as a table", () => {
    const html = latexBlocksToHtml("\\begin{tabular}{ll}A & B \\\\\\end{tabular}");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>A</td>");
    expect(html).toContain("<td>B</td>");
  });

  it("renders lstlisting as pre>code", () => {
    const html = latexBlocksToHtml("\\begin{lstlisting}\nprint('hi')\n\\end{lstlisting}");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("print('hi')");
  });

  it("renders quote as blockquote", () => {
    const html = latexBlocksToHtml("\\begin{quote}\nA quoted line.\n\\end{quote}");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("A quoted line.");
  });

  it("splits plain paragraphs on blank lines", () => {
    const html = latexBlocksToHtml("First paragraph.\n\nSecond paragraph.");
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
  });
});

// ---------------------------------------------------------------------------
// domNodeToLatex / editableDomToLatex (HTML -> LaTeX)
// ---------------------------------------------------------------------------

describe("domNodeToLatex round trips", () => {
  const roundTrip = (latex) => {
    const html = latexBlocksToHtml(latex);
    const div = document.createElement("div");
    div.innerHTML = html;
    return editableDomToLatex(div);
  };

  it("round trips quote with nested bold", () => {
    const src = "Intro text.\n\n\\begin{quote}\nThis is a quoted \\textbf{warning} line.\n\\end{quote}\n\nMore text.";
    expect(roundTrip(src)).toBe(src);
  });

  it("round trips strikethrough", () => {
    const src = "Some \\sout{deleted} text.";
    expect(roundTrip(src)).toBe(src);
  });

  it("round trips an inserted table (matching the toolbar's insertTable helper)", () => {
    const div = document.createElement("div");
    div.innerHTML =
      "<p>Before</p>" +
      "<table><tbody><tr><td>Header 1</td><td>Header 2</td></tr><tr><td>Row 1</td><td>Row 1</td></tr></tbody></table>" +
      "<p><br></p>";
    expect(editableDomToLatex(div)).toBe(
      "Before\n\n\\begin{tabular}{|l|l|}\n\\hline\nHeader 1 & Header 2 \\\\ \\hline\nRow 1 & Row 1 \\\\ \\hline\n\\end{tabular}"
    );
  });

  it("round trips an inserted code block", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p>Before</p><pre><code>print('hi')</code></pre><p><br></p>";
    expect(editableDomToLatex(div)).toBe("Before\n\n\\begin{lstlisting}\nprint('hi')\n\\end{lstlisting}");
  });

  it("round trips an inserted equation span using its stashed data-latex source", () => {
    const div = document.createElement("div");
    div.innerHTML = 'Value is <span class="ngn-math" contenteditable="false" data-latex="E = mc^2">rendered</span> done.';
    expect(editableDomToLatex(div)).toBe("Value is $E = mc^2$ done.");
  });

  it("round trips a heading plus bullet list combo", () => {
    const div = document.createElement("div");
    div.innerHTML = "<h4>My Heading</h4><ul><li>One</li><li>Two</li></ul>";
    expect(editableDomToLatex(div)).toBe("\\paragraph{My Heading}\n\n\\begin{itemize}\n\\item One\n\\item Two\n\\end{itemize}");
  });

  it("treats execCommand-native tags (b/i/strike) as aliases of their canonical form", () => {
    const div = document.createElement("div");
    div.innerHTML = "<b>bold</b> <i>italic</i> <strike>gone</strike>";
    const out = editableDomToLatex(div);
    expect(out).toContain("\\textbf{bold}");
    expect(out).toContain("\\textit{italic}");
    expect(out).toContain("\\sout{gone}");
  });

  it("does not treat texttt content inside a pre block as inline code", () => {
    const div = document.createElement("div");
    div.innerHTML = "<pre><code>plain_code()</code></pre>";
    expect(editableDomToLatex(div)).toBe("\\begin{lstlisting}\nplain_code()\n\\end{lstlisting}");
  });
});

// ---------------------------------------------------------------------------
// parseLatexForPreview / serializeDocumentToLatex
// ---------------------------------------------------------------------------

describe("parseLatexForPreview", () => {
  it("extracts title/author/date/abstract/sections", () => {
    const src =
      "\\title{My Report}\\author{Jane}\\date{2026-01-01}\\maketitle" +
      "\\begin{abstract}Summary text.\\end{abstract}" +
      "\\section{Intro}Intro body." +
      "\\section{Conclusion}Final body.";
    const doc = parseLatexForPreview(src);
    expect(doc.title).toBe("My Report");
    expect(doc.author).toBe("Jane");
    expect(doc.date).toBe("2026-01-01");
    expect(doc.abstractText.trim()).toBe("Summary text.");
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].title).toBe("Intro");
    expect(doc.sections[1].title).toBe("Conclusion");
  });

  it("falls back gracefully on empty input", () => {
    const doc = parseLatexForPreview("");
    expect(doc.title).toBe("");
    expect(doc.sections).toEqual([]);
  });

  it("puts unstructured content into fallbackBody when there are no sections", () => {
    const doc = parseLatexForPreview("Just some prose with no structure markers.");
    expect(doc.sections).toEqual([]);
    expect(doc.fallbackBody).toContain("Just some prose");
  });
});

describe("serializeDocumentToLatex", () => {
  it("omits the title block entirely when title is empty", () => {
    const out = serializeDocumentToLatex({ title: "", author: "", date: "", abstractLatex: "", sections: [] });
    expect(out).not.toContain("\\title");
    expect(out).not.toContain("\\maketitle");
  });

  it("includes title/author/date/maketitle when title is present", () => {
    const out = serializeDocumentToLatex({
      title: "T",
      author: "A",
      date: "D",
      abstractLatex: "",
      sections: [],
    });
    expect(out).toContain("\\title{T}");
    expect(out).toContain("\\author{A}");
    expect(out).toContain("\\date{D}");
    expect(out).toContain("\\maketitle");
  });

  it("defaults author to NGNotes and date to \\today when blank", () => {
    const out = serializeDocumentToLatex({ title: "T", author: "", date: "", abstractLatex: "", sections: [] });
    expect(out).toContain("\\author{NGNotes}");
    expect(out).toContain("\\date{\\today}");
  });

  it("serializes sections with fallback numbered titles", () => {
    const out = serializeDocumentToLatex({
      title: "",
      author: "",
      date: "",
      abstractLatex: "",
      sections: [{ title: "", contentLatex: "body" }],
    });
    expect(out).toContain("\\section{Section 1}");
    expect(out).toContain("body");
  });

  it("appends fallbackLatex as raw body when there are no sections (mirrors handleArticleBlur)", () => {
    const out = serializeDocumentToLatex(
      { title: "T", author: "A", date: "D", abstractLatex: "", sections: [] },
      "Unstructured recovered body."
    );
    expect(out).toBe("\\title{T}\n\n\\author{A}\n\n\\date{D}\n\n\\maketitle\n\nUnstructured recovered body.\n");
  });

  it("ignores fallbackLatex when sections are present", () => {
    const out = serializeDocumentToLatex(
      { title: "", author: "", date: "", abstractLatex: "", sections: [{ title: "S", contentLatex: "body" }] },
      "should not appear"
    );
    expect(out).not.toContain("should not appear");
  });
});

// ---------------------------------------------------------------------------
// renderArticleHtml (unified editor) + handleArticleBlur-style reconstruction
// ---------------------------------------------------------------------------

describe("renderArticleHtml", () => {
  it("tags title/author/date/abstract-body/section/section-title/section-body/fallback with data-role", () => {
    const doc = parseLatexForPreview(
      "\\title{T}\\author{A}\\date{D}\\maketitle" +
        "\\begin{abstract}Abstract text.\\end{abstract}" +
        "\\section{S1}Body one."
    );
    const html = renderArticleHtml(doc);
    const root = document.createElement("div");
    root.innerHTML = html;

    expect(root.querySelector('[data-role="title"]').textContent).toBe("T");
    expect(root.querySelector('[data-role="author"]').textContent).toBe("A");
    expect(root.querySelector('[data-role="date"]').textContent).toBe("D");
    expect(root.querySelector('[data-role="abstract-body"]').textContent).toContain("Abstract text.");
    expect(root.querySelectorAll('[data-role="section"]')).toHaveLength(1);
    expect(root.querySelector('[data-role="section-title"]').textContent).toBe("S1");
    expect(root.querySelector('[data-role="section-body"]').textContent).toContain("Body one.");
  });

  it("renders a fallback region tagged with data-role when there are no sections", () => {
    const doc = parseLatexForPreview("Unstructured content only.");
    const root = document.createElement("div");
    root.innerHTML = renderArticleHtml(doc);
    expect(root.querySelector('[data-role="fallback"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-role="section"]')).toHaveLength(0);
  });

  it("marks the Abstract label as non-editable so it can't be typed over", () => {
    const doc = parseLatexForPreview("\\section{S}x\\begin{abstract}Text\\end{abstract}");
    const root = document.createElement("div");
    root.innerHTML = renderArticleHtml(doc);
    const label = root.querySelector('[data-role="abstract"] h2');
    expect(label.getAttribute("contenteditable")).toBe("false");
  });

  it("full generate -> edit -> re-render cycle preserves content", () => {
    const original = "\\title{Report}\\author{NGNotes}\\date{\\today}\\maketitle\\section{Findings}Key finding here.";
    const doc = parseLatexForPreview(original);
    const root = document.createElement("div");
    root.innerHTML = renderArticleHtml(doc);

    // Simulate the article's onBlur reconstruction (mirrors handleArticleBlur).
    const titleEl = root.querySelector('[data-role="title"]');
    const sectionBody = root.querySelector('[data-role="section-body"]');
    expect(titleEl.textContent).toBe("Report");
    expect(editableDomToLatex(sectionBody)).toBe("Key finding here.");
  });
});

// ---------------------------------------------------------------------------
// extractLatexSectionTitles / extractTemplateHeadings (template save flow)
// ---------------------------------------------------------------------------

describe("extractLatexSectionTitles", () => {
  it("extracts unique section titles in order", () => {
    const src = "\\section{Intro}x\\section{Results}y\\section{Intro}z";
    expect(extractLatexSectionTitles(src)).toEqual(["Intro", "Results"]);
  });

  it("returns an empty array with no sections", () => {
    expect(extractLatexSectionTitles("no sections here")).toEqual([]);
  });
});

describe("extractTemplateHeadings", () => {
  it("extracts numbered and colon-terminated headings", () => {
    const text = "1. Introduction\nSome text\nResults:\nMore text\nA. Discussion";
    const headings = extractTemplateHeadings(text);
    expect(headings).toContain("Introduction");
    expect(headings).toContain("Results");
    expect(headings).toContain("Discussion");
  });
});

// ---------------------------------------------------------------------------
// stripStrayLatexCommands
// ---------------------------------------------------------------------------

describe("stripStrayLatexCommands", () => {
  it("unwraps command braces and drops bare commands", () => {
    expect(stripStrayLatexCommands("\\foo{kept} \\bar plain")).toBe("kept  plain");
  });
});
