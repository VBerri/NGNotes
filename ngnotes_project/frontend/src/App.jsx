import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Braces,
  Code,
  Columns3,
  Download,
  Heading,
  Highlighter,
  Image,
  Italic,
  Layers,
  List,
  ListOrdered,
  Loader2,
  FileText,
  Mic,
  Plus,
  Quote,
  Redo2,
  Rows3,
  Settings2,
  Sigma,
  Sparkles,
  Square,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
  X,
  Upload,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8010";
const DEFAULT_SYSTEM_PROMPT = "You are an expert note-to-report assistant.";
const DEFAULT_USER_TEMPLATE =
  "Expand the raw notes into a well-structured, factual report, keeping the writer's own voice and tone.";

// Sampler-parameter presets are personal, device-local settings (not shared
// documents like report templates), so they live in localStorage rather than
// the backend's file-based template store.
const PARAM_PRESET_STORAGE_KEY = "ngnotes_param_presets";

function loadParamPresets() {
  try {
    const raw = window.localStorage.getItem(PARAM_PRESET_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const BUILTIN_TEMPLATE_PROFILES = [
  {
    id: "builtin-ieee",
    name: "IEEE Template (Engineering)",
    hint:
      "Use an engineering-style technical report voice with clear problem statement, method, results, and recommendations. Treat this as loose guidance.",
  },
  {
    id: "builtin-patient-care",
    name: "Patient Care Report Template (Medical)",
    hint:
      "Use a clinical care-report tone with patient context, findings, assessment, interventions, and follow-up. Treat this as loose guidance.",
  },
  {
    id: "builtin-monthly",
    name: "Monthly Report Template",
    hint:
      "Structure as monthly summary, key outcomes, blockers, decisions, and upcoming priorities. Treat this as loose guidance.",
  },
];

const INPUT_BLOCK_TYPES = {
  raw: "Raw Notes",
  document: "Document Input",
  vc: "VC Input",
  image: "Image Input",
};

const TEMPLATE_BLOCK_OPTIONS = [
  { id: "auto", title: "Auto (LLM Chooses Best)", subtitle: "LLM synthesizes the best-fit template from any domain" },
  { id: "builtin-patient-care", title: "Medical (Patient Report)", subtitle: "Patient care style" },
  { id: "builtin-ieee", title: "Engineering (IEEE Template)", subtitle: "Technical engineering style" },
  { id: "builtin-monthly", title: "Monthly Report", subtitle: "Monthly progress narrative" },
];

function makeInputBlock(type, initial = "") {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: INPUT_BLOCK_TYPES[type] || "Input",
    content: initial,
    imageFile: null,
    imageFileName: "",
    imageDescription: "",
    analyzing: false,
    vcAudioUrl: "",
    vcIsRecording: false,
    vcSpeechStatus: "",
  };
}

function normalizeBackendTemplate(t) {
  const id = String(t?.id || "").toLowerCase();
  const filename = String(t?.filename || "").toLowerCase();
  const joined = `${id} ${filename}`;

  if (joined.includes("ieee")) {
    return {
      ...t,
      name: "IEEE Template (Engineering)",
      preview_excerpt: t.preview_excerpt || "",
      kind: "curated",
    };
  }

  if (joined.includes("patient") && joined.includes("care")) {
    return {
      ...t,
      name: "Patient Care Report Template (Medical)",
      preview_excerpt: t.preview_excerpt || "",
      kind: "curated",
    };
  }

  if (joined.includes("mothly") || joined.includes("monthly")) {
    return {
      ...t,
      name: "Monthly Report Template",
      preview_excerpt: t.preview_excerpt || "",
      kind: "curated",
    };
  }

  // Everything else is a user-saved custom template (headings-only).
  return { ...t, kind: "custom" };
}

export function extractLatexSectionTitles(latexSource) {
  const src = String(latexSource || "");
  const out = [];
  const seen = new Set();
  const sectionRegex = /\\section\*?\{([\s\S]*?)\}/g;
  let match;
  while ((match = sectionRegex.exec(src)) !== null) {
    const title = decodeLatexPreviewText(match[1] || "");
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}

function downloadBlob(blob, filename) {
  if (!blob || blob.size === 0) {
    throw new Error("Export returned an empty file.");
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  // Click synchronously, in the same tick as the triggering user gesture —
  // deferring via requestAnimationFrame/setTimeout can drop out of the
  // browser's brief "user activation" window after an intervening await
  // (the fetch/blob conversion above), which silently blocks the download
  // in stricter browsers instead of throwing a catchable error.
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function extractTemplateHeadings(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const out = [];
  const seen = new Set();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length > 120) continue;
    if (/^\{[^{}]+\}$/.test(line)) continue;

    let candidate = "";
    if (/^(\d+\.|[A-Z]\.|[IVX]+\.)\s+/.test(line)) {
      candidate = line.replace(/^(\d+\.|[A-Z]\.|[IVX]+\.)\s+/, "").trim();
    } else if (line.endsWith(":")) {
      candidate = line.slice(0, -1).trim();
    } else if (/^[A-Z][A-Za-z0-9\s/&()\-]{2,100}$/.test(line) && line.split(/\s+/).length <= 10) {
      candidate = line;
    }

    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= 12) break;
  }

  return out;
}

function findMatchingBackendTemplate(name, backendTemplates) {
  const target = String(name || "").toLowerCase();
  if (!target) return null;

  for (const tpl of backendTemplates || []) {
    const joined = `${String(tpl?.name || "")} ${String(tpl?.filename || "")} ${String(tpl?.id || "")}`.toLowerCase();
    if (target.includes("monthly") && joined.includes("monthly")) return tpl;
    if (target.includes("patient") && target.includes("care") && joined.includes("patient") && joined.includes("care")) return tpl;
    if (target.includes("ieee") && joined.includes("ieee")) return tpl;
  }

  return null;
}

// No-trim core: safe to apply to inline text fragments (e.g. the plain-text
// segments between \textbf{}/\$.../$ matches in renderInlineLatexHtml), where
// trimming would incorrectly eat the whitespace that separates that fragment
// from its neighbors ("This is " + "and " must not become "Thisisand").
export function decodeLatexEscapes(text) {
  let s = String(text || "");
  const replacements = [
    [/\\textbackslash\{\}/g, "\\"],
    [/\\&/g, "&"],
    [/\\%/g, "%"],
    [/\\\$/g, "$"],
    [/\\#/g, "#"],
    [/\\_/g, "_"],
    [/\\\{/g, "{"],
    [/\\\}/g, "}"],
    [/\\textasciitilde\{\}/g, "~"],
    [/\\textasciicircum\{\}/g, "^"],
    [/\\today/g, new Date().toLocaleDateString()],
    [/~+/g, " "],
  ];

  for (const [pattern, replacement] of replacements) {
    s = s.replace(pattern, replacement);
  }

  return s.replace(/\\\\/g, "\n");
}

// Trimmed variant for whole-value fields (title/author/date/etc.) where the
// surrounding whitespace is genuinely insignificant.
export function decodeLatexPreviewText(text) {
  return decodeLatexEscapes(text).trim();
}

export function parseLatexForPreview(latexSource) {
  const src = String(latexSource || "");
  if (!src.trim()) {
    return { title: "", author: "", date: "", abstractText: "", sections: [], fallbackBody: "" };
  }

  const titleMatch = src.match(/\\title\{([\s\S]*?)\}/);
  const authorMatch = src.match(/\\author\{([\s\S]*?)\}/);
  const dateMatch = src.match(/\\date\{([\s\S]*?)\}/);
  const abstractMatch = src.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);

  const sections = [];
  const sectionRegex = /\\section\{([\s\S]*?)\}/g;
  const markers = [];
  let match;
  while ((match = sectionRegex.exec(src)) !== null) {
    markers.push({
      title: decodeLatexPreviewText(match[1] || "Section"),
      start: sectionRegex.lastIndex,
      markerStart: match.index,
    });
  }

  // Content below is kept as raw LaTeX (not decoded) so the rich renderer can
  // still detect structural markers like \begin{itemize} or \textbf{...}.
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const end = next ? next.markerStart : src.length;
    const rawContent = src.slice(current.start, end);
    const cleaned = rawContent.replace(/\\(maketitle|begin\{document\}|end\{document\})/g, "").trim();
    sections.push({ title: current.title, content: cleaned });
  }

  const fallbackBody = src
    .replace(/\\title\{[\s\S]*?\}/g, "")
    .replace(/\\author\{[\s\S]*?\}/g, "")
    .replace(/\\date\{[\s\S]*?\}/g, "")
    .replace(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/g, "")
    .replace(/\\section\{[\s\S]*?\}/g, "")
    .replace(/\\(maketitle|begin\{document\}|end\{document\})/g, "")
    .trim();

  return {
    title: decodeLatexPreviewText(titleMatch?.[1] || "Engineering Report"),
    author: decodeLatexPreviewText(authorMatch?.[1] || "NGNotes"),
    date: decodeLatexPreviewText(dateMatch?.[1] || ""),
    abstractText: (abstractMatch?.[1] || "").trim(),
    sections,
    fallbackBody,
  };
}

export function stripStrayLatexCommands(text) {
  let s = String(text || "");
  s = s.replace(/\\[A-Za-z@]+\*?\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\[A-Za-z@]+\*?/g, "");
  s = s.replace(/[{}]/g, "");
  return s;
}

function renderKatex(math) {
  try {
    return katex.renderToString(String(math || ""), { throwOnError: false, output: "html" });
  } catch {
    return String(math || "");
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Renders inline LaTeX (bold/italic/code/math) to an HTML string for use inside
// contentEditable regions. Math spans are rendered via KaTeX but marked
// contenteditable="false" with the original source stashed in data-latex, so a
// user can't corrupt the rendered markup and we can recover the exact math
// source when serializing the edited DOM back to LaTeX.
export function renderInlineLatexHtml(text) {
  const src = String(text || "");
  let out = "";
  let idx = 0;
  const pattern =
    /\\textbf\{([^{}]*)\}|\\textit\{([^{}]*)\}|\\emph\{([^{}]*)\}|\\texttt\{([^{}]*)\}|\\underline\{([^{}]*)\}|\\sout\{([^{}]*)\}|\\textsuperscript\{([^{}]*)\}|\\textsubscript\{([^{}]*)\}|\\colorbox\{[^{}]*\}\{([^{}]*)\}|\$([^$]+)\$/g;
  let m;
  while ((m = pattern.exec(src)) !== null) {
    if (m.index > idx) {
      out += escapeHtml(stripStrayLatexCommands(decodeLatexEscapes(src.slice(idx, m.index))));
    }
    if (m[1] !== undefined) {
      out += `<strong>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[1])))}</strong>`;
    } else if (m[2] !== undefined || m[3] !== undefined) {
      out += `<em>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[2] ?? m[3])))}</em>`;
    } else if (m[4] !== undefined) {
      out += `<code>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[4])))}</code>`;
    } else if (m[5] !== undefined) {
      out += `<u>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[5])))}</u>`;
    } else if (m[6] !== undefined) {
      out += `<s>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[6])))}</s>`;
    } else if (m[7] !== undefined) {
      out += `<sup>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[7])))}</sup>`;
    } else if (m[8] !== undefined) {
      out += `<sub>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[8])))}</sub>`;
    } else if (m[9] !== undefined) {
      out += `<mark>${escapeHtml(stripStrayLatexCommands(decodeLatexPreviewText(m[9])))}</mark>`;
    } else if (m[10] !== undefined) {
      out += `<span class="ngn-math" contenteditable="false" data-latex="${escapeHtml(m[10])}">${renderKatex(m[10])}</span>`;
    }
    idx = pattern.lastIndex;
  }
  if (idx < src.length) {
    out += escapeHtml(stripStrayLatexCommands(decodeLatexEscapes(src.slice(idx))));
  }
  return out;
}

export function splitLatexBlocks(text) {
  const src = String(text || "");
  const blockPattern =
    /\\begin\{(itemize|enumerate|tabular|tabularx|longtable|lstlisting|verbatim|quote)\}([\s\S]*?)\\end\{\1\}|\\paragraph\{([^{}]*)\}/g;
  const blocks = [];
  let lastIndex = 0;
  let m;
  while ((m = blockPattern.exec(src)) !== null) {
    if (m.index > lastIndex) {
      blocks.push({ type: "para", text: src.slice(lastIndex, m.index) });
    }
    if (m[1]) {
      blocks.push({ type: m[1], text: m[2] });
    } else if (m[3] !== undefined) {
      blocks.push({ type: "heading", text: m[3] });
    }
    lastIndex = blockPattern.lastIndex;
  }
  if (lastIndex < src.length) {
    blocks.push({ type: "para", text: src.slice(lastIndex) });
  }
  return blocks;
}

// HTML-string mirror of the block renderer, for use as the initial content of
// contentEditable regions (dangerouslySetInnerHTML). Kept in exact sync with
// splitLatexBlocks/renderInlineLatexHtml's vocabulary so domNodeToLatex below
// can serialize edited DOM back into the same LaTeX constructs.
export function latexBlocksToHtml(text) {
  const blocks = splitLatexBlocks(text);
  let html = "";

  blocks.forEach((block) => {
    if (block.type === "para") {
      const paragraphs = block.text
        .split(/\n\s*\n|\\\\/)
        .map((p) => p.trim())
        .filter(Boolean);
      paragraphs.forEach((p) => {
        html += `<p>${renderInlineLatexHtml(p)}</p>`;
      });
      return;
    }

    if (block.type === "heading") {
      html += `<h4>${renderInlineLatexHtml(block.text)}</h4>`;
      return;
    }

    if (block.type === "itemize" || block.type === "enumerate") {
      const items = block.text
        .split(/\\item\b/)
        .map((s) => s.trim())
        .filter(Boolean);
      const tag = block.type === "itemize" ? "ul" : "ol";
      html += `<${tag}>` + items.map((it) => `<li>${renderInlineLatexHtml(it)}</li>`).join("") + `</${tag}>`;
      return;
    }

    if (block.type === "tabular" || block.type === "tabularx" || block.type === "longtable") {
      const body = block.text.replace(/^\s*\{[^{}]*\}\s*/, "");
      const rows = body
        .split(/\\\\/)
        // \hline is our own convention; \toprule/\midrule/\bottomrule/\cline{}
        // are booktabs rules the LLM may emit despite the prompt now asking it
        // not to — strip them too so they never leak into a cell as literal text.
        .map((r) => r.replace(/\\hline|\\toprule|\\midrule|\\bottomrule|\\cline\{[^{}]*\}/g, "").trim())
        .filter(Boolean);
      html +=
        "<table><tbody>"
        + rows
          .map((row) => "<tr>" + row.split("&").map((cell) => `<td>${renderInlineLatexHtml(cell.trim())}</td>`).join("") + "</tr>")
          .join("")
        + "</tbody></table>";
      return;
    }

    if (block.type === "lstlisting" || block.type === "verbatim") {
      const code = block.text.replace(/^\[[^\]]*\]/, "").replace(/^\n/, "");
      html += `<pre><code>${escapeHtml(code)}</code></pre>`;
      return;
    }

    if (block.type === "quote") {
      html += `<blockquote>${renderInlineLatexHtml(block.text.trim())}</blockquote>`;
    }
  });

  return html || "<p><br></p>";
}

// Reverse of latexBlocksToHtml/renderInlineLatexHtml: walks an edited
// contentEditable DOM subtree and reconstructs LaTeX using the same bounded
// vocabulary. Scoped intentionally to only what we ever render, not arbitrary
// HTML, so the round-trip stays predictable.
export function domNodeToLatex(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node;
  if (el.dataset && el.dataset.latex !== undefined) {
    return `$${el.dataset.latex}$`;
  }

  const tag = el.tagName.toLowerCase();
  const kids = () => Array.from(el.childNodes).map(domNodeToLatex).join("");

  switch (tag) {
    case "strong":
    case "b":
      return `\\textbf{${kids()}}`;
    case "em":
    case "i":
      return `\\textit{${kids()}}`;
    case "code":
      return el.closest("pre") ? kids() : `\\texttt{${kids()}}`;
    case "u":
      return `\\underline{${kids()}}`;
    case "s":
    case "del":
    case "strike":
      return `\\sout{${kids()}}`;
    case "sup":
      return `\\textsuperscript{${kids()}}`;
    case "sub":
      return `\\textsubscript{${kids()}}`;
    case "mark":
      return `\\colorbox{yellow}{${kids()}}`;
    case "blockquote":
      return `\\begin{quote}\n${kids().trim()}\n\\end{quote}\n\n`;
    case "br":
      return "\n";
    case "p":
      return `${kids()}\n\n`;
    case "div":
      return `${kids()}\n`;
    case "h4":
      return `\\paragraph{${kids().trim()}}\n\n`;
    case "ul":
    case "ol": {
      const env = tag === "ul" ? "itemize" : "enumerate";
      const items = Array.from(el.children)
        .map((li) => `\\item ${domNodeToLatex(li).trim()}`)
        .join("\n");
      return `\\begin{${env}}\n${items}\n\\end{${env}}\n\n`;
    }
    case "li":
      return kids();
    case "table": {
      const rows = Array.from(el.querySelectorAll("tr"));
      const colCount = rows[0] ? rows[0].children.length : 1;
      // Full grid — vertical bars in the column spec plus \hline after every
      // row (including the last) — matches both the LLM prompt's table
      // convention and the browser preview's own grid CSS, so PDF and
      // preview render the same visible borders instead of PDF having none.
      const rowLines = rows.map(
        (tr) => Array.from(tr.children).map((td) => domNodeToLatex(td).trim()).join(" & ") + " \\\\ \\hline"
      );
      const colSpec = "|" + "l|".repeat(colCount);
      return `\\begin{tabular}{${colSpec}}\n\\hline\n${rowLines.join("\n")}\n\\end{tabular}\n\n`;
    }
    case "pre": {
      const codeEl = el.querySelector("code");
      const code = ((codeEl ? codeEl.textContent : el.textContent) || "").replace(/\n$/, "");
      return `\\begin{lstlisting}\n${code}\n\\end{lstlisting}\n\n`;
    }
    default:
      return kids();
  }
}

export function editableDomToLatex(container) {
  const raw = Array.from(container.childNodes).map(domNodeToLatex).join("");
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}

// fallbackLatex is only used when doc.sections is empty: it's the raw body
// used when the document couldn't be parsed into structured sections (see
// handleArticleBlur) and gets appended as-is instead of a \section block.
export function serializeDocumentToLatex(doc, fallbackLatex) {
  const parts = [];
  const title = String(doc.title || "").trim();
  if (title) {
    parts.push(`\\title{${title}}`);
    parts.push(`\\author{${String(doc.author || "").trim() || "NGNotes"}}`);
    parts.push(`\\date{${String(doc.date || "").trim() || "\\today"}}`);
    parts.push("\\maketitle");
  }

  const abstractLatex = String(doc.abstractLatex || "").trim();
  if (abstractLatex) {
    parts.push(`\\begin{abstract}\n${abstractLatex}\n\\end{abstract}`);
  }

  const sections = doc.sections || [];
  if (sections.length > 0) {
    sections.forEach((s, idx) => {
      const sectionTitle = String(s.title || "").trim() || `Section ${idx + 1}`;
      const content = String(s.contentLatex || "").trim();
      parts.push(`\\section{${sectionTitle}}\n${content}`);
    });
  } else if (fallbackLatex) {
    parts.push(fallbackLatex);
  }

  return parts.join("\n\n") + "\n";
}

// Renders the entire report (title/author/date/abstract/sections/fallback)
// as one HTML string for a single unified contentEditable region, tagged with
// data-role markers so handleArticleBlur (below, in App) can walk the edited
// DOM back into structured LaTeX without needing per-field editable regions.
export function renderArticleHtml(doc) {
  const title = escapeHtml(doc.title || "Engineering Report");
  const author = escapeHtml(doc.author || "NGNotes");
  const date = escapeHtml(doc.date || "");

  let html = '<header class="border-b border-slate-200 pb-5 text-center">';
  html += `<h1 class="text-2xl font-semibold tracking-tight text-slate-900" data-role="title">${title}</h1>`;
  html += `<p class="mt-2 text-sm text-slate-600" data-role="author">${author}</p>`;
  html += `<p class="mt-1 text-xs uppercase tracking-wide text-slate-400" data-role="date">${date}</p>`;
  html += "</header>";

  if (doc.abstractText) {
    html += '<section class="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4" data-role="abstract">';
    html += '<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500" contenteditable="false">Abstract</h2>';
    html += `<div class="ngn-rich-content" data-role="abstract-body">${latexBlocksToHtml(doc.abstractText)}</div>`;
    html += "</section>";
  }

  if (doc.sections.length > 0) {
    html += '<div class="mt-7 space-y-6" data-role="sections">';
    doc.sections.forEach((s, idx) => {
      const sectionTitle = escapeHtml(s.title || `Section ${idx + 1}`);
      html += '<section data-role="section">';
      html += `<h3 class="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900" data-role="section-title">${sectionTitle}</h3>`;
      html += `<div class="ngn-rich-content" data-role="section-body">${latexBlocksToHtml(s.content)}</div>`;
      html += "</section>";
    });
    html += "</div>";
  } else {
    html += '<section class="mt-6 ngn-rich-content" data-role="fallback">';
    html += doc.fallbackBody
      ? latexBlocksToHtml(doc.fallbackBody)
      : "<p>Unable to parse structured sections from the generated document. Start typing to write one.</p>";
    html += "</section>";
  }

  return html;
}

export default function App() {
  const noteFileRef = useRef(null);
  const mediaRecorderByBlockRef = useRef({});
  const mediaStreamByBlockRef = useRef({});
  const speechRecognitionByBlockRef = useRef({});
  const vcFinalTranscriptByBlockRef = useRef({});

  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");

  const [inputBlocks, setInputBlocks] = useState([makeInputBlock("raw", "")]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userPromptTemplate, setUserPromptTemplate] = useState(DEFAULT_USER_TEMPLATE);
  const mode = "both";
  const promptVariant = "default";
  const [temperature, setTemperature] = useState(0.3);
  const [topP, setTopP] = useState(0.95);
  const [minP, setMinP] = useState(0.05);
  const [topK, setTopK] = useState(40);
  // Reasoning-capable models spend part of this budget on internal thinking
  // before the real answer; too low a cap can exhaust it before any report
  // content is produced. 8192 gives that headroom while staying well inside
  // the backend's generous read timeout.
  const [maxTokens, setMaxTokens] = useState(8192);
  const [repetitionPenalty, setRepetitionPenalty] = useState(1.03);
  const [paramPresets, setParamPresets] = useState(loadParamPresets);
  const [confirmDeletePreset, setConfirmDeletePreset] = useState(null);

  const [backendTemplates, setBackendTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("auto");
  const [templateHint, setTemplateHint] = useState("");
  const [templateHeadings, setTemplateHeadings] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);

  const [outputText, setOutputText] = useState("");
  const [runningGenerate, setRunningGenerate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showManageTemplates, setShowManageTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(null);
  const [outputViewMode, setOutputViewMode] = useState("preview");
  const [editRequest, setEditRequest] = useState("");
  const [applyingEdits, setApplyingEdits] = useState(false);
  const [toast, setToast] = useState("");

  const customBackendTemplates = backendTemplates.filter((t) => t.kind === "custom");

  const templateBlockOptions = [
    ...TEMPLATE_BLOCK_OPTIONS,
    ...customBackendTemplates.map((t) => ({
      id: `backend:${t.id}`,
      title: t.name,
      subtitle: "Saved template (section headers only)",
    })),
  ];

  const templateOptions = [
    { id: "auto", name: "Auto (LLM Chooses Best)", source: "system", hint: "" },
    ...BUILTIN_TEMPLATE_PROFILES.map((p) => ({ ...p, source: "builtin" })),
    ...customBackendTemplates.map((t) => ({
      id: `backend:${t.id}`,
      name: t.name,
      source: "backend",
      hint: t.preview_excerpt || "",
    })),
  ];

  const addInputBlock = (type) => {
    setInputBlocks((prev) => [...prev, makeInputBlock(type, "")]);
  };

  const updateInputBlock = (id, nextContent) => {
    setInputBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content: nextContent } : b)));
  };

  const updateInputBlockFields = (id, fields) => {
    setInputBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...fields } : b)));
  };

  const removeInputBlock = (id) => {
    setInputBlocks((prev) => {
      const target = prev.find((b) => b.id === id);
      if (target?.vcAudioUrl) {
        try {
          URL.revokeObjectURL(target.vcAudioUrl);
        } catch {
          // Ignore URL revoke failures.
        }
      }

      const mediaRecorder = mediaRecorderByBlockRef.current[id];
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch {
          // Ignore recorder stop failures.
        }
      }
      const mediaStream = mediaStreamByBlockRef.current[id];
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      const speechRecognition = speechRecognitionByBlockRef.current[id];
      if (speechRecognition) {
        try {
          speechRecognition.stop();
        } catch {
          // Ignore speech stop failures.
        }
      }
      delete mediaRecorderByBlockRef.current[id];
      delete mediaStreamByBlockRef.current[id];
      delete speechRecognitionByBlockRef.current[id];
      delete vcFinalTranscriptByBlockRef.current[id];

      const next = prev.filter((b) => b.id !== id);
      return next.length ? next : [makeInputBlock("raw", "")];
    });
  };

  const handleNewDocument = () => {
    inputBlocks.forEach((block) => {
      if (block.vcAudioUrl) {
        try {
          URL.revokeObjectURL(block.vcAudioUrl);
        } catch {
          // Ignore URL revoke failures.
        }
      }
      const mediaRecorder = mediaRecorderByBlockRef.current[block.id];
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch {
          // Ignore recorder stop failures.
        }
      }
      const mediaStream = mediaStreamByBlockRef.current[block.id];
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      const speechRecognition = speechRecognitionByBlockRef.current[block.id];
      if (speechRecognition) {
        try {
          speechRecognition.stop();
        } catch {
          // Ignore speech stop failures.
        }
      }
      delete mediaRecorderByBlockRef.current[block.id];
      delete mediaStreamByBlockRef.current[block.id];
      delete speechRecognitionByBlockRef.current[block.id];
      delete vcFinalTranscriptByBlockRef.current[block.id];
    });

    setInputBlocks([makeInputBlock("raw", "")]);
    setOutputText("");
    setEditRequest("");
    setSelectedTemplateId("auto");
    setTemplateHint("");
    setTemplateHeadings([]);
    setOutputViewMode("preview");
    setTimedToast("Started a new document.");
  };

  useEffect(() => {
    return () => {
      Object.values(mediaRecorderByBlockRef.current).forEach((recorder) => {
        if (recorder && recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // Ignore recorder stop failures.
          }
        }
      });

      Object.values(mediaStreamByBlockRef.current).forEach((stream) => {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      });

      Object.values(speechRecognitionByBlockRef.current).forEach((recognizer) => {
        if (recognizer) {
          try {
            recognizer.stop();
          } catch {
            // Ignore speech stop failures.
          }
        }
      });

      inputBlocks.forEach((block) => {
        if (block.vcAudioUrl) {
          try {
            URL.revokeObjectURL(block.vcAudioUrl);
          } catch {
            // Ignore URL revoke failures.
          }
        }
      });
    };
  }, [inputBlocks]);

  const buildEngineeringNoteFromBlocks = () => {
    return inputBlocks
      .filter((b) => (b.type === "raw" || b.type === "document") && String(b.content || "").trim())
      .map((b) => `### ${b.label}\n${String(b.content || "").trim()}`)
      .join("\n\n");
  };

  const buildSupplementalContextFromBlocks = () => {
    return inputBlocks
      .filter(
        (b) =>
          (b.type === "vc" && String(b.content || "").trim())
          || (b.type === "image" && (String(b.imageDescription || "").trim() || String(b.content || "").trim()))
      )
      .map((b) => {
        if (b.type === "image") {
          const text = String(b.imageDescription || b.content || "").trim();
          return text ? `### Image Context\n${text}` : "";
        }
        return `### Voice Transcript\n${String(b.content || "").trim()}`;
      })
      .filter(Boolean)
      .join("\n\n");
  };

  const handleImageBlockFileChange = (blockId, file) => {
    if (!file) return;
    updateInputBlockFields(blockId, {
      imageFile: file,
      imageFileName: file.name,
      imageDescription: "",
    });
  };

  const startVCBlockRecording = async (blockId) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setTimedToast("Microphone recording is not supported in this browser.", 4500);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      mediaStreamByBlockRef.current[blockId] = stream;
      mediaRecorderByBlockRef.current[blockId] = recorder;
      vcFinalTranscriptByBlockRef.current[blockId] = "";

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);

        setInputBlocks((prev) =>
          prev.map((b) => {
            if (b.id !== blockId) return b;
            if (b.vcAudioUrl) {
              try {
                URL.revokeObjectURL(b.vcAudioUrl);
              } catch {
                // Ignore URL revoke failures.
              }
            }
            return {
              ...b,
              vcAudioUrl: audioUrl,
              vcIsRecording: false,
              vcSpeechStatus: "Recording stopped. Review and edit transcript below.",
            };
          })
        );

        stream.getTracks().forEach((track) => track.stop());
        delete mediaRecorderByBlockRef.current[blockId];
        delete mediaStreamByBlockRef.current[blockId];
      };

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognizer = new SpeechRecognition();
        recognizer.lang = "en-US";
        recognizer.continuous = true;
        recognizer.interimResults = true;

        recognizer.onresult = (event) => {
          let finalChunk = "";
          let interimChunk = "";

          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const transcript = event.results[i][0]?.transcript || "";
            if (event.results[i].isFinal) {
              finalChunk += `${transcript} `;
            } else {
              interimChunk += `${transcript} `;
            }
          }

          if (finalChunk.trim()) {
            vcFinalTranscriptByBlockRef.current[blockId] = `${vcFinalTranscriptByBlockRef.current[blockId] || ""} ${finalChunk}`.trim();
          }

          const merged = `${vcFinalTranscriptByBlockRef.current[blockId] || ""} ${interimChunk}`.trim();
          updateInputBlockFields(blockId, {
            content: merged,
            vcSpeechStatus: interimChunk.trim() ? "Listening..." : "Transcribing...",
          });
        };

        recognizer.onerror = () => {
          updateInputBlockFields(blockId, {
            vcSpeechStatus: "Speech-to-text had an error. You can edit transcript manually.",
          });
        };

        recognizer.onend = () => {
          updateInputBlockFields(blockId, {
            vcSpeechStatus: "Speech-to-text ended. You can edit transcript manually.",
          });
        };

        speechRecognitionByBlockRef.current[blockId] = recognizer;
        try {
          recognizer.start();
        } catch {
          // Ignore duplicate start errors.
        }
      } else {
        updateInputBlockFields(blockId, {
          vcSpeechStatus: "Speech-to-text is not supported in this browser. Please type/edit transcript manually.",
        });
      }

      updateInputBlockFields(blockId, {
        vcIsRecording: true,
        vcSpeechStatus: "Recording...",
      });

      recorder.start(250);
    } catch (err) {
      setTimedToast(`Microphone start failed: ${err.message}`, 4500);
    }
  };

  const stopVCBlockRecording = (blockId) => {
    const recorder = mediaRecorderByBlockRef.current[blockId];
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignore recorder stop failures.
      }
    }

    const recognizer = speechRecognitionByBlockRef.current[blockId];
    if (recognizer) {
      try {
        recognizer.stop();
      } catch {
        // Ignore speech stop failures.
      }
      delete speechRecognitionByBlockRef.current[blockId];
    }

    updateInputBlockFields(blockId, {
      vcIsRecording: false,
      vcSpeechStatus: "Processing speech-to-text...",
    });
  };

  const setTimedToast = (text, ms = 3000) => {
    setToast(text);
    window.setTimeout(() => setToast(""), ms);
  };

  const apiFetch = async (path, options = {}) => {
    const base = backendUrl.replace(/\/$/, "");
    const res = await fetch(`${base}${path}`, options);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const payload = await res.json();
        detail = payload.detail || JSON.stringify(payload);
      } catch {
        detail = await res.text();
      }
      const error = new Error(detail || `HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return res;
  };

  const refreshBackendTemplates = async () => {
    const templatesRes = await apiFetch("/api/report-templates");
    const templatesData = await templatesRes.json();
    const normalized = Array.isArray(templatesData.templates)
      ? templatesData.templates.map(normalizeBackendTemplate).filter(Boolean)
      : [];
    setBackendTemplates(normalized);
    return normalized;
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        await apiFetch("/api/health");
        const modelRes = await apiFetch("/api/default-models");
        const modelData = await modelRes.json();
        const models = Array.isArray(modelData.models) ? modelData.models : [];
        if (cancelled) return;
        setAvailableModels(models);
        if (!selectedModel && models.length) setSelectedModel(models[0]);

        if (!cancelled) await refreshBackendTemplates();
      } catch (err) {
        if (!cancelled) setTimedToast(`Backend unavailable: ${err.message}`, 4500);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [backendUrl]);

  const handleUploadNoteFile = async (file) => {
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch("/api/extract-note-file", { method: "POST", body: form });
      const data = await res.json();
      const extracted = String(data.extracted_text || "").trim();
      const warning = String(data.warning || "").trim();

      if (warning) {
        setTimedToast(`File import warning: ${warning}`, 5000);
        return;
      }

      if (!extracted) {
        setTimedToast("File import produced no readable text.", 4500);
        return;
      }

      setInputBlocks((prev) => [...prev, makeInputBlock("document", extracted)]);
      setTimedToast(`Imported ${data.filename || file.name}`);
    } catch (err) {
      setTimedToast(`File import failed: ${err.message}`, 4500);
    }
  };

  const handleAnalyzeImageBlock = async (blockId) => {
    const block = inputBlocks.find((b) => b.id === blockId);
    if (!block?.imageFile) {
      setTimedToast("Select an image in the block first.");
      return;
    }
    try {
      updateInputBlockFields(blockId, { analyzing: true });
      const form = new FormData();
      form.append("file", block.imageFile);
      form.append("model", selectedModel || "");
      const res = await apiFetch("/api/analyze-image", { method: "POST", body: form });
      const data = await res.json();
      const desc = String(data.description || "").trim();
      updateInputBlockFields(blockId, { imageDescription: desc, content: desc });
      setTimedToast(`Image analyzed with ${data.vision_model || "vision model"}`);
    } catch (err) {
      setTimedToast(`Image analysis failed: ${err.message}`, 4500);
    } finally {
      updateInputBlockFields(blockId, { analyzing: false });
    }
  };

  const handleTemplateChange = async (nextId) => {
    if (nextId === "none") {
      nextId = "auto";
    }
    setSelectedTemplateId(nextId);

    if (nextId === "auto") {
      setTemplateHint(
        "AUTO TEMPLATE MODE: Infer the best report type from notes using broad domain knowledge, then synthesize the section structure and style accordingly (e.g., malware triage, incident response, root-cause analysis, compliance review, medical, engineering, finance, operations)."
      );
      setTemplateHeadings([]);
      return;
    }

    const selected = templateOptions.find((t) => t.id === nextId);
    if (!selected) {
      setTemplateHint("");
      setTemplateHeadings([]);
      return;
    }

    if (selected.source === "backend") {
      const backendId = nextId.replace("backend:", "");
      try {
        setTemplateLoading(true);
        const res = await apiFetch(`/api/report-templates/${encodeURIComponent(backendId)}/preview`);
        const data = await res.json();
        const preview = String(data.preview_text || selected.hint || "");
        setTemplateHint(preview);
        setTemplateHeadings(extractTemplateHeadings(preview));
      } catch (err) {
        setTemplateHint(selected.hint || "");
        setTemplateHeadings(extractTemplateHeadings(selected.hint || ""));
        setTimedToast(`Template preview unavailable: ${err.message}`, 3500);
      } finally {
        setTemplateLoading(false);
      }
      return;
    }

    const matchedBackend = findMatchingBackendTemplate(
      selected.name,
      backendTemplates.filter((t) => t.kind === "curated")
    );
    if (matchedBackend?.id) {
      try {
        setTemplateLoading(true);
        const res = await apiFetch(`/api/report-templates/${encodeURIComponent(matchedBackend.id)}/preview`);
        const data = await res.json();
        const preview = String(data.preview_text || selected.hint || "");
        setTemplateHint(preview);
        setTemplateHeadings(extractTemplateHeadings(preview));
      } catch (err) {
        setTemplateHint(selected.hint || "");
        setTemplateHeadings(extractTemplateHeadings(selected.hint || ""));
        setTimedToast(`Template preview unavailable: ${err.message}`, 3500);
      } finally {
        setTemplateLoading(false);
      }
      return;
    }

    setTemplateHint(selected.hint || "");
    setTemplateHeadings(extractTemplateHeadings(selected.hint || ""));
  };

  const resolveReportTemplateId = () => {
    if (selectedTemplateId === "auto") return undefined;
    const selected = templateOptions.find((t) => t.id === selectedTemplateId);
    if (!selected) return undefined;
    if (selected.source === "backend") return selected.id.replace("backend:", "");
    const matchedBackend = findMatchingBackendTemplate(
      selected.name,
      backendTemplates.filter((t) => t.kind === "curated")
    );
    return matchedBackend?.id;
  };

  const hasGeneratedOutput = Boolean(outputText.trim());
  const previewDoc = useMemo(() => parseLatexForPreview(outputText), [outputText]);

  // The whole report (title/author/date/abstract/sections/fallback) lives in
  // one contentEditable article (see renderArticleHtml). Editing only commits
  // on blur (not per-keystroke) so React never re-renders — and disturbs — the
  // region while the user is actively typing. On blur we walk the edited DOM
  // by data-role marker and rebuild the full LaTeX document in one pass.
  const handleArticleBlur = (e) => {
    const root = e.currentTarget;
    const titleEl = root.querySelector('[data-role="title"]');
    const authorEl = root.querySelector('[data-role="author"]');
    const dateEl = root.querySelector('[data-role="date"]');
    const abstractBodyEl = root.querySelector('[data-role="abstract-body"]');
    const sectionEls = Array.from(root.querySelectorAll('[data-role="section"]'));
    const fallbackEl = root.querySelector('[data-role="fallback"]');

    const doc = {
      title: titleEl ? titleEl.textContent.trim() : previewDoc.title,
      author: authorEl ? authorEl.textContent.trim() : previewDoc.author,
      date: dateEl ? dateEl.textContent.trim() : previewDoc.date,
      abstractLatex: abstractBodyEl ? editableDomToLatex(abstractBodyEl) : "",
      sections: sectionEls.map((secEl, idx) => {
        const bodyEl = secEl.querySelector('[data-role="section-body"]');
        return {
          title: (secEl.querySelector('[data-role="section-title"]')?.textContent || "").trim() || `Section ${idx + 1}`,
          contentLatex: bodyEl ? editableDomToLatex(bodyEl) : "",
        };
      }),
    };
    const fallbackLatex = sectionEls.length === 0 && fallbackEl ? editableDomToLatex(fallbackEl) : "";

    setOutputText(serializeDocumentToLatex(doc, fallbackLatex));
  };

  // Tags with a native contentEditable execCommand equivalent are routed
  // through execCommand instead of manual Range surgery: the browser handles
  // toggling/un-toggling correctly on already-formatted text, and — unlike
  // manual DOM mutation — execCommand edits are recorded in the native
  // undo/redo history (see undoEdit/redoEdit below).
  const NATIVE_FORMAT_COMMANDS = {
    strong: "bold",
    em: "italic",
    u: "underline",
    s: "strikeThrough",
    sup: "superscript",
    sub: "subscript",
  };

  // All toolbar operations must only ever touch the report article. Without
  // this guard, a selection left anywhere else on the page (header text, a
  // template card) would happily receive an inserted table or a <mark> wrap —
  // range APIs don't care whether the target is contentEditable.
  const selectionInsideArticle = (selection) => {
    if (!selection || selection.rangeCount === 0) return false;
    const node = selection.getRangeAt(0).commonAncestorContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return Boolean(el && el.closest && el.closest(".ngn-doc-article"));
  };

  // Wraps the current text selection (anywhere in the report article) in a
  // formatting tag. Toolbar buttons call this on click; they use
  // onMouseDown+preventDefault so the click never blurs the editable region
  // first, which would otherwise collapse the selection before we get to it.
  // The DOM mutation here isn't synced to outputText immediately — it rides
  // along with the article's own onBlur handler like any other typed edit.
  const applyInlineFormat = (tagName) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selectionInsideArticle(selection)) {
      setTimedToast("Select some text in the report first.");
      return;
    }

    const nativeCommand = NATIVE_FORMAT_COMMANDS[tagName];
    if (nativeCommand) {
      document.execCommand(nativeCommand, false);
      return;
    }

    // No native execCommand for these (inline code, highlight) — wrap manually.
    const range = selection.getRangeAt(0);
    const wrapper = document.createElement(tagName);
    try {
      range.surroundContents(wrapper);
    } catch {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
    }
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    selection.addRange(newRange);
  };

  const undoEdit = () => document.execCommand("undo");
  const redoEdit = () => document.execCommand("redo");

  // Table row/column helpers act on whichever <table> the caret is currently
  // inside. Like the other toolbar actions, the DOM mutation isn't synced to
  // outputText until the article's onBlur fires.
  const closestFromSelection = (selector) => {
    const selection = window.getSelection();
    if (!selectionInsideArticle(selection)) return null;
    const node = selection.getRangeAt(0).startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return el ? el.closest(selector) : null;
  };

  const addTableRow = () => {
    const table = closestFromSelection("table");
    if (!table) {
      setTimedToast("Click inside a table first.");
      return;
    }
    const rows = table.querySelectorAll("tr");
    const colCount = rows.length ? rows[rows.length - 1].children.length : 1;
    const tr = document.createElement("tr");
    for (let i = 0; i < colCount; i += 1) {
      tr.appendChild(document.createElement("td"));
    }
    (table.querySelector("tbody") || table).appendChild(tr);
  };

  const addTableColumn = () => {
    const table = closestFromSelection("table");
    if (!table) {
      setTimedToast("Click inside a table first.");
      return;
    }
    table.querySelectorAll("tr").forEach((tr) => tr.appendChild(document.createElement("td")));
  };

  const deleteTableRow = () => {
    const tr = closestFromSelection("tr");
    if (!tr) {
      setTimedToast("Click inside a table row first.");
      return;
    }
    const table = tr.closest("table");
    if (table && table.querySelectorAll("tr").length <= 1) {
      setTimedToast("A table needs at least one row.");
      return;
    }
    tr.remove();
  };

  const deleteTableColumn = () => {
    const td = closestFromSelection("td,th");
    if (!td) {
      setTimedToast("Click inside a table cell first.");
      return;
    }
    const table = td.closest("table");
    const firstRow = table?.querySelector("tr");
    if (firstRow && firstRow.children.length <= 1) {
      setTimedToast("A table needs at least one column.");
      return;
    }
    const colIndex = Array.from(td.parentElement.children).indexOf(td);
    table.querySelectorAll("tr").forEach((tr) => {
      tr.children[colIndex]?.remove();
    });
  };

  // Block-level formatting (heading/quote/lists) delegated to the browser's
  // native contentEditable editing commands — they already produce the exact
  // <h4>/<blockquote>/<ul>/<ol><li> markup domNodeToLatex expects.
  const applyBlockFormat = (command, value) => {
    const selection = window.getSelection();
    if (!selectionInsideArticle(selection)) {
      setTimedToast("Click into the report first.");
      return;
    }
    document.execCommand(command, false, value);
  };

  // Inserts arbitrary HTML at the current cursor position inside the report
  // article (used for tables/code blocks/equations, which aren't a simple
  // wrap-the-selection operation).
  const insertHtmlAtCursor = (html) => {
    const selection = window.getSelection();
    if (!selectionInsideArticle(selection)) {
      setTimedToast("Click into the report first.");
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const template = document.createElement("template");
    template.innerHTML = html;
    const frag = template.content;
    const lastNode = frag.lastChild;
    range.insertNode(frag);
    if (lastNode) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  };

  const insertTable = () => {
    insertHtmlAtCursor(
      "<table><tbody>" +
        "<tr><td>Header 1</td><td>Header 2</td></tr>" +
        "<tr><td>Row 1</td><td>Row 1</td></tr>" +
        "<tr><td>Row 2</td><td>Row 2</td></tr>" +
        "</tbody></table><p><br></p>"
    );
  };

  const insertCodeBlock = () => {
    insertHtmlAtCursor("<pre><code>your code here</code></pre><p><br></p>");
  };

  const insertEquation = () => {
    const mathSrc = window.prompt("Enter LaTeX math (no $ signs needed), e.g. E = mc^2");
    if (!mathSrc || !mathSrc.trim()) return;
    const trimmed = mathSrc.trim();
    insertHtmlAtCursor(
      `<span class="ngn-math" contenteditable="false" data-latex="${escapeHtml(trimmed)}">${renderKatex(trimmed)}</span>&nbsp;`
    );
  };

  const buildLooseTemplateGuidance = () => {
    if (selectedTemplateId === "auto") {
      return [
        "Template selection mode: AUTO (open-domain).",
        "Infer the closest report archetype from the notes using your own knowledge across domains.",
        "Do not constrain yourself to built-in templates; synthesize a best-fit structure (for example: malware triage analysis, incident postmortem, threat intel brief, reliability RCA, compliance audit, clinical case review, financial risk memo, etc.).",
        "Then produce a clear, professional report using headings that match that inferred archetype.",
        "Ground all claims in the provided notes and avoid inventing unsupported facts.",
      ].join("\n");
    }

    const selected = templateOptions.find((t) => t.id === selectedTemplateId);
    const selectedName = selected?.name || "Selected template";
    const hint = String(templateHint || "").trim();
    const condensedHint = hint ? hint.slice(0, 1800) : "";
    const isMonthly = /monthly/i.test(selectedName);

    return [
      `Secondary template guidance: ${selectedName}`,
      "This template is a soft style reference, not a strict structure.",
      "Primary source of truth is the note content.",
      "Prefer using section titles from the selected template when they fit the evidence.",
      "Do not copy template wording verbatim unless it clearly matches the note content.",
      isMonthly
        ? "For monthly reports: keep the monthly intent, but summarize naturally based on actual updates, outcomes, blockers, and next steps from the notes."
        : "Use professional style aligned to the template while keeping flexible structure.",
      isMonthly
        ? "Formatting requirement for monthly reports: output in arXiv-style LaTeX with \\title{...}, \\section{Abstract}, \\section{Executive Summary}, \\section{Introduction}, \\section{Results}, and \\section{Conclusion}."
        : "",
      templateHeadings.length
        ? `Template section titles to prioritize (in order where possible): ${templateHeadings.join(" | ")}`
        : "",
      condensedHint ? `Template reference snippet:\n${condensedHint}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const handleSaveCurrentAsTemplate = async () => {
    if (!outputText.trim()) {
      setTimedToast("Generate output first, then save it as a template.");
      return;
    }

    const headings = extractLatexSectionTitles(outputText);
    if (!headings.length) {
      setTimedToast("No section headers found in the current document to save as a template.");
      return;
    }

    const name = window.prompt("Template name:", "My custom format");
    if (!name || !name.trim()) return;

    try {
      const res = await apiFetch("/api/report-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), headings }),
      });
      const saved = await res.json();
      await refreshBackendTemplates();
      setSelectedTemplateId(`backend:${saved.id}`);
      setTemplateHint(saved.preview_excerpt || headings.join("\n"));
      setTemplateHeadings(headings);
      setTimedToast(`Saved template: ${saved.name} (${headings.length} section headers)`);
    } catch (err) {
      setTimedToast(`Save template failed: ${err.message}. Please try again.`, 5000);
    }
  };

  const handleStartEditTemplate = (t) => {
    setEditingTemplate({
      id: t.id,
      name: t.name,
      headingsText: (t.preview_excerpt || "").trim(),
    });
  };

  const handleSaveEditedTemplate = async () => {
    if (!editingTemplate) return;
    const name = editingTemplate.name.trim();
    const headings = editingTemplate.headingsText
      .split("\n")
      .map((h) => h.trim())
      .filter(Boolean);

    if (!name) {
      setTimedToast("Template name is required.");
      return;
    }
    if (!headings.length) {
      setTimedToast("At least one section heading is required.");
      return;
    }

    try {
      const res = await apiFetch(`/api/report-templates/${encodeURIComponent(editingTemplate.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, headings }),
      });
      const saved = await res.json();
      const wasSelected = selectedTemplateId === `backend:${editingTemplate.id}`;
      await refreshBackendTemplates();
      if (wasSelected) setSelectedTemplateId(`backend:${saved.id}`);
      setEditingTemplate(null);
      setTimedToast(`Updated template: ${saved.name}`);
    } catch (err) {
      setTimedToast(`Update template failed: ${err.message}. Please try again.`, 5000);
    }
  };

  const requestDeleteTemplate = (t) => setConfirmDeleteTemplate(t);

  const handleDeleteTemplate = async (t) => {
    try {
      await apiFetch(`/api/report-templates/${encodeURIComponent(t.id)}`, { method: "DELETE" });
      if (selectedTemplateId === `backend:${t.id}`) {
        setSelectedTemplateId("auto");
        setTemplateHint("");
        setTemplateHeadings([]);
      }
      if (editingTemplate?.id === t.id) setEditingTemplate(null);
      await refreshBackendTemplates();
      setTimedToast(`Deleted template: ${t.name}`);
    } catch (err) {
      setTimedToast(`Delete template failed: ${err.message}. Please try again.`, 5000);
    } finally {
      setConfirmDeleteTemplate(null);
    }
  };

  const persistParamPresets = (next) => {
    setParamPresets(next);
    try {
      window.localStorage.setItem(PARAM_PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can fail (private browsing, quota) -- the preset still applies
      // for this session, it just won't survive a reload.
    }
  };

  const handleSaveParamPreset = () => {
    const name = window.prompt("Preset name:", "My preset");
    if (!name || !name.trim()) return;
    const preset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      temperature: Number(temperature),
      topP: Number(topP),
      minP: Number(minP),
      topK: Number(topK),
      maxTokens: Number(maxTokens),
      repetitionPenalty: Number(repetitionPenalty),
      userPromptTemplate,
    };
    persistParamPresets([...paramPresets, preset]);
    setTimedToast(`Saved preset: ${preset.name}`);
  };

  const handleApplyParamPreset = (preset) => {
    setTemperature(preset.temperature);
    setTopP(preset.topP);
    setMinP(preset.minP);
    setTopK(preset.topK);
    setMaxTokens(preset.maxTokens);
    setRepetitionPenalty(preset.repetitionPenalty);
    // Older presets saved before this field existed won't have it -- keep
    // whatever user prompt is currently set rather than blanking it out.
    if (preset.userPromptTemplate !== undefined) {
      setUserPromptTemplate(preset.userPromptTemplate);
    }
    setTimedToast(`Applied preset: ${preset.name}`);
  };

  const requestDeleteParamPreset = (preset) => setConfirmDeletePreset(preset);

  const handleDeleteParamPreset = (preset) => {
    persistParamPresets(paramPresets.filter((p) => p.id !== preset.id));
    setTimedToast(`Deleted preset: ${preset.name}`);
    setConfirmDeletePreset(null);
  };

  const handleGenerate = async () => {
    const mergedEngineeringNote = buildEngineeringNoteFromBlocks();
    const mergedSupplemental = buildSupplementalContextFromBlocks();
    const totalSourceLength = `${mergedEngineeringNote}\n${mergedSupplemental}`.trim().length;

    if (totalSourceLength < 20) {
      setTimedToast("Add more source content across notes, voice, or image blocks (at least 20 characters total).");
      return;
    }
    if (!selectedModel) {
      setTimedToast("Select a model first.");
      return;
    }

    try {
      setRunningGenerate(true);
      const reportTemplateId = resolveReportTemplateId();
      const customTemplateHint = reportTemplateId ? undefined : buildLooseTemplateGuidance();

      const res = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineering_note: mergedEngineeringNote,
          model: selectedModel,
          mode,
          prompt_variant: promptVariant,
          system_prompt: systemPrompt,
          user_prompt_template: userPromptTemplate,
          report_template_id: reportTemplateId,
          custom_template_hint: customTemplateHint,
          image_description: mergedSupplemental || undefined,
          params: {
            temperature: Number(temperature),
            top_p: Number(topP),
            min_p: Number(minP),
            top_k: Number(topK),
            max_tokens: Number(maxTokens),
            repetition_penalty: Number(repetitionPenalty),
          },
        }),
      });

      const data = await res.json();
      setOutputText(String(data.output || ""));
      setTimedToast(`Generated with ${data.model}`);
    } catch (err) {
      setOutputText("");
      setTimedToast(`Generation failed: ${err.message}. Please try again.`, 5000);
    } finally {
      setRunningGenerate(false);
    }
  };

  // Shared by the visible "Apply edits" box and the silent auto-fix-on-export-error
  // flow below: sends the current draft + edit instructions through /api/generate
  // exactly like a user-typed edit request, and returns the revised LaTeX.
  // Throws (does not touch outputText) on failure so callers can decide how to react.
  const requestDocumentEdit = async (instructionsText, sourceLatex) => {
    const reportTemplateId = resolveReportTemplateId();
    const customTemplateHint = reportTemplateId ? undefined : buildLooseTemplateGuidance();
    const editSource = [
      "Current report draft (LaTeX body):",
      sourceLatex,
      "",
      "Requested edits:",
      instructionsText,
      "",
      "Requirements:",
      "- Apply the requested changes while preserving existing valid content.",
      "- Keep the result as complete LaTeX body content.",
      "- Keep section formatting consistent with the existing report style.",
    ].join("\n");

    const res = await apiFetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engineering_note: editSource,
        model: selectedModel,
        mode,
        prompt_variant: promptVariant,
        system_prompt: systemPrompt,
        user_prompt_template: userPromptTemplate,
        report_template_id: reportTemplateId,
        custom_template_hint: customTemplateHint,
        params: {
          temperature: Number(temperature),
          top_p: Number(topP),
          min_p: Number(minP),
          top_k: Number(topK),
          max_tokens: Number(maxTokens),
          repetition_penalty: Number(repetitionPenalty),
        },
      }),
    });

    const data = await res.json();
    const nextOutput = String(data.output || "").trim();
    if (!nextOutput) {
      throw new Error("No updated document returned.");
    }
    return nextOutput;
  };

  const exportPdfOnce = async (latexText) => {
    // /api/export-pdf only ever reads summary/allow_code_blocks/filename (see
    // ExportPdfRequest) — it re-derives the title from the LaTeX itself rather
    // than needing the original source notes or template context.
    const res = await apiFetch("/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: latexText,
        allow_code_blocks: true,
        filename: "ngnotes_report",
      }),
    });
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    const downloadName = filenameMatch?.[1] || `ngnotes_report_${Date.now()}.pdf`;
    downloadBlob(blob, downloadName);
  };

  const handleExportPdf = async () => {
    if (!outputText.trim()) {
      setTimedToast("Generate output first.");
      return;
    }
    try {
      await exportPdfOnce(outputText);
      setTimedToast("PDF exported.");
      return;
    } catch (err) {
      // export-pdf returns 422 for anything wrong with the document itself
      // (a LaTeX compile error, unbalanced braces, malformed math, ...) as
      // opposed to a network/server failure. Those are exactly the class of
      // problem an edit request can fix, so silently route one through the
      // same edit mechanism as the "Apply edits" box instead of just telling
      // the user to regenerate — this never touches the visible edit textbox.
      if (err.status !== 422 || !selectedModel) {
        setTimedToast(`PDF export failed: ${err.message}`, 9000);
        return;
      }

      setTimedToast("Found a formatting error in the document — fixing it automatically...", 6000);
      try {
        const fixInstructions =
          "Fix formatting errors only. This document just failed to export to PDF due to a LaTeX syntax problem: " +
          err.message +
          " Return the SAME document with the same title, sections, and content, with ONLY that specific syntax " +
          "problem corrected. Do not summarize, describe, or write about the error or the fix process — output " +
          "the corrected report itself, not a description of what went wrong.";
        const fixedLatex = await requestDocumentEdit(fixInstructions, outputText);
        setOutputText(fixedLatex);
        await exportPdfOnce(fixedLatex);
        setTimedToast("Fixed a formatting error automatically and exported the PDF.");
      } catch (fixErr) {
        setTimedToast(
          `Automatic fix failed: ${fixErr.message}. Try "Apply edits" manually or regenerate the document.`,
          9000
        );
      }
    }
  };

  const handleApplyEdits = async () => {
    const requestText = editRequest.trim();
    if (!requestText) {
      setTimedToast("Enter edit instructions first.");
      return;
    }
    if (!outputText.trim()) {
      setTimedToast("Generate output first.");
      return;
    }
    if (!selectedModel) {
      setTimedToast("Select a model first.");
      return;
    }

    try {
      setApplyingEdits(true);
      const nextOutput = await requestDocumentEdit(requestText, outputText);
      setOutputText(nextOutput);
      setEditRequest("");
      setTimedToast("Edits applied to document.");
    } catch (err) {
      setTimedToast(`Edit failed: ${err.message}. Document was not changed — please try again.`, 5000);
    } finally {
      setApplyingEdits(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <input
        ref={noteFileRef}
        type="file"
        accept=".pdf,.md,.doc,.docx,.json,.xml,.txt"
        className="hidden"
        onChange={(e) => {
          handleUploadNoteFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 max-w-lg -translate-x-1/2 whitespace-pre-wrap break-words rounded-xl bg-slate-900 px-5 py-3 text-center text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}

      {confirmDeleteTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">Delete saved template?</div>
            <p className="mt-2 text-sm text-slate-600">
              "{confirmDeleteTemplate.name}" will be permanently deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteTemplate(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTemplate(confirmDeleteTemplate)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeletePreset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">Delete saved preset?</div>
            <p className="mt-2 text-sm text-slate-600">
              "{confirmDeletePreset.name}" will be permanently deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDeletePreset(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteParamPreset(confirmDeletePreset)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90" style={{ backdropFilter: "blur(8px)" }}>
        <div className="mx-auto flex h-14 w-[95%] items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue-600 shadow-sm">
              <Layers size={17} className="text-brand-gold-400" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-brand-blue-900">NGNotes</span>
            <span className="rounded-full border border-brand-gold-300 bg-brand-gold-50 px-2 py-0.5 text-xs font-medium text-brand-gold-700">Reports</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[95%] py-5">
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <label className="w-full text-xs font-medium text-slate-600 md:w-56">
              Ollama Backend URL
              <input
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="http://127.0.0.1:8010"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
              />
            </label>
            <label className="w-full text-xs font-medium text-slate-600 md:w-56">
              Model
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
              >
                {availableModels.length === 0 && <option value="">No models loaded</option>}
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Settings2 size={14} /> Advanced
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" style={{ minHeight: "64vh" }}>
          <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold">Source Inputs</h2>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">Template Blocks</div>
                  {customBackendTemplates.length > 0 && (
                    <button
                      onClick={() => setShowManageTemplates(true)}
                      className="text-[11px] font-medium text-brand-blue-600 hover:underline"
                    >
                      Manage saved
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {templateBlockOptions.map((opt) => {
                    const active = selectedTemplateId === opt.id;
                    const isSaved = opt.id.startsWith("backend:");
                    return (
                      <div
                        key={opt.id}
                        className={`relative rounded-lg border ${active ? "border-brand-gold-500 bg-brand-gold-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                      >
                        <button onClick={() => handleTemplateChange(opt.id)} className="w-full px-3 py-2 text-left">
                          <div className={`text-xs font-semibold text-slate-800 ${isSaved ? "pr-5" : ""}`}>{opt.title}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{opt.subtitle}</div>
                        </button>
                        {isSaved && (
                          <button
                            onClick={() => requestDeleteTemplate({ id: opt.id.replace("backend:", ""), name: opt.title })}
                            aria-label={`Delete ${opt.title}`}
                            title={`Delete ${opt.title}`}
                            className="absolute right-1 top-1 rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => noteFileRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload size={13} /> Upload note file
                </button>
                <button
                  onClick={() => addInputBlock("vc")}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Mic size={13} /> Voice input
                </button>
                <button
                  onClick={() => addInputBlock("raw")}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileText size={13} /> Add raw notes block
                </button>
                <button
                  onClick={() => addInputBlock("image")}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Image size={13} /> Add image block
                </button>
              </div>

              <div className="space-y-2">
                {inputBlocks.map((block, idx) => (
                  <div key={block.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{block.label} #{idx + 1}</span>
                      <button
                        onClick={() => removeInputBlock(block.id)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    </div>
                    {block.type === "vc" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => startVCBlockRecording(block.id)}
                            disabled={block.vcIsRecording}
                            className={`rounded-lg px-3 py-2 text-xs font-medium ${block.vcIsRecording ? "cursor-not-allowed bg-slate-200 text-slate-500" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                          >
                            <Mic size={13} className="mr-1 inline" /> Start recording
                          </button>
                          <button
                            onClick={() => stopVCBlockRecording(block.id)}
                            disabled={!block.vcIsRecording}
                            className={`rounded-lg px-3 py-2 text-xs font-medium ${!block.vcIsRecording ? "cursor-not-allowed bg-slate-200 text-slate-500" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                          >
                            <Square size={13} className="mr-1 inline" /> Stop recording
                          </button>
                        </div>

                        {block.vcAudioUrl && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="mb-1 text-xs font-medium text-slate-600">Replay recording</div>
                            <audio controls src={block.vcAudioUrl} className="w-full" />
                          </div>
                        )}

                        <div className="text-[11px] text-slate-500">{block.vcSpeechStatus || "Use the mic, then review and edit speech-to-text."}</div>

                        <textarea
                          value={block.content}
                          onChange={(e) => updateInputBlock(block.id, e.target.value)}
                          rows={4}
                          placeholder="Speech to Text (editable)"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                        />
                      </div>
                    ) : block.type === "image" ? (
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            handleImageBlockFileChange(block.id, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700"
                        />
                        {block.imageFileName && <div className="text-xs text-slate-500">Selected image: {block.imageFileName}</div>}
                        <button
                          onClick={() => handleAnalyzeImageBlock(block.id)}
                          disabled={block.analyzing || !block.imageFile}
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${block.analyzing || !block.imageFile ? "cursor-not-allowed bg-slate-200 text-slate-500" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                        >
                          {block.analyzing ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <Settings2 size={13} className="mr-1 inline" />}
                          Analyze image
                        </button>
                        <textarea
                          value={block.imageDescription || ""}
                          onChange={(e) => updateInputBlockFields(block.id, { imageDescription: e.target.value, content: e.target.value })}
                          rows={4}
                          placeholder="Image analyzer output appears here..."
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                        />
                      </div>
                    ) : (
                      <textarea
                        value={block.content}
                        onChange={(e) => updateInputBlock(block.id, e.target.value)}
                        rows={block.type === "raw" ? 6 : 4}
                        placeholder={`Enter ${block.label.toLowerCase()}...`}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleGenerate}
                disabled={runningGenerate}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white ${runningGenerate ? "cursor-not-allowed bg-slate-400" : "bg-brand-blue-600 hover:bg-brand-blue-700"}`}
              >
                {runningGenerate ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {runningGenerate ? "Generating..." : "Generate"}
              </button>

              {showAdvanced && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
                  <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                      <div>
                        <div className="text-base font-semibold text-slate-900">Advanced sampler controls</div>
                        <p className="mt-1 text-sm text-slate-500">Adjust generation settings, then close the panel to return to notes.</p>
                      </div>
                      <button
                        onClick={() => setShowAdvanced(false)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        aria-label="Close advanced settings"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="space-y-5 px-5 py-5">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <label className="text-xs font-medium text-slate-600">
                          Temperature
                          <input type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30" />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Top-k
                          <input type="number" step="1" value={topK} onChange={(e) => setTopK(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30" />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Top-p
                          <input type="number" step="0.05" value={topP} onChange={(e) => setTopP(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30" />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Bottom-p
                          <input type="number" step="0.01" value={minP} onChange={(e) => setMinP(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30" />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Repetition penalty
                          <input type="number" step="0.01" value={repetitionPenalty} onChange={(e) => setRepetitionPenalty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30" />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Max tokens
                          <input type="number" step="256" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30" />
                        </label>
                      </div>

                      <div className="border-t border-slate-100 pt-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">User Prompt</div>
                          <button
                            onClick={() => setUserPromptTemplate(DEFAULT_USER_TEMPLATE)}
                            disabled={userPromptTemplate === DEFAULT_USER_TEMPLATE}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Reset to default
                          </button>
                        </div>
                        <p className="mb-2 text-[11px] text-slate-500">
                          The task instruction sent to the model on top of your notes. This is the only prompt
                          setting exposed here — the underlying formatting rules, anti-hallucination guardrails,
                          and voice/tone behavior stay the same regardless of what you put here.
                        </p>
                        <textarea
                          value={userPromptTemplate}
                          onChange={(e) => setUserPromptTemplate(e.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                        />
                      </div>

                      <div className="border-t border-slate-100 pt-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Presets</div>
                          <button
                            onClick={handleSaveParamPreset}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Sparkles size={13} /> Save current as preset
                          </button>
                        </div>
                        {paramPresets.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No saved presets yet. Dial in the settings above, then save them for reuse.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {paramPresets.map((preset) => (
                              <div
                                key={preset.id}
                                className="relative rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                              >
                                <button onClick={() => handleApplyParamPreset(preset)} className="w-full px-3 py-2 pr-7 text-left">
                                  <div className="text-xs font-semibold text-slate-800">{preset.name}</div>
                                  <div className="mt-0.5 text-[11px] text-slate-500">
                                    temp {preset.temperature} &middot; top-k {preset.topK} &middot; top-p {preset.topP} &middot; rep {preset.repetitionPenalty}
                                  </div>
                                </button>
                                <button
                                  onClick={() => requestDeleteParamPreset(preset)}
                                  aria-label={`Delete ${preset.name}`}
                                  title={`Delete ${preset.name}`}
                                  className="absolute right-1 top-1 rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                        <button
                          onClick={() => setShowAdvanced(false)}
                          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showManageTemplates && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
                  <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                      <div>
                        <div className="text-base font-semibold text-slate-900">Manage saved templates</div>
                        <p className="mt-1 text-sm text-slate-500">Rename, edit section headers, or delete templates you've saved.</p>
                      </div>
                      <button
                        onClick={() => {
                          setShowManageTemplates(false);
                          setEditingTemplate(null);
                        }}
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        aria-label="Close manage templates"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-5">
                      {customBackendTemplates.length === 0 ? (
                        <p className="text-sm text-slate-500">No saved templates yet. Use "Save as template" on a generated document.</p>
                      ) : (
                        customBackendTemplates.map((t) => (
                          <div key={t.id} className="rounded-xl border border-slate-200 p-3">
                            {editingTemplate?.id === t.id ? (
                              <div className="space-y-2">
                                <input
                                  value={editingTemplate.name}
                                  onChange={(e) => setEditingTemplate((prev) => ({ ...prev, name: e.target.value }))}
                                  placeholder="Template name"
                                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                                />
                                <textarea
                                  value={editingTemplate.headingsText}
                                  onChange={(e) => setEditingTemplate((prev) => ({ ...prev, headingsText: e.target.value }))}
                                  rows={5}
                                  placeholder="One section header per line"
                                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => setEditingTemplate(null)}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={handleSaveEditedTemplate}
                                    className="rounded-lg bg-brand-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-700"
                                  >
                                    Save changes
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-800">{t.name}</div>
                                  <div className="mt-1 whitespace-pre-line text-xs text-slate-500">{t.preview_excerpt}</div>
                                </div>
                                <div className="flex shrink-0 gap-1.5">
                                  <button
                                    onClick={() => handleStartEditTemplate(t)}
                                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => requestDeleteTemplate(t)}
                                    className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-semibold">Report Output</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-medium text-slate-600">
                  <button
                    onClick={() => setOutputViewMode("preview")}
                    className={`rounded-md px-3 py-1.5 ${outputViewMode === "preview" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setOutputViewMode("source")}
                    className={`rounded-md px-3 py-1.5 ${outputViewMode === "source" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
                  >
                    Source
                  </button>
                </div>
                {hasGeneratedOutput && (
                  <>
                    <button onClick={handleSaveCurrentAsTemplate} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Sparkles size={13} /> Save as template
                    </button>
                    <button onClick={handleExportPdf} className="flex items-center gap-1.5 rounded-lg bg-brand-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-700">
                      <Download size={13} /> Export PDF
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              {outputViewMode === "source" ? (
                <textarea
                  value={outputText}
                  onChange={(e) => setOutputText(e.target.value)}
                  rows={22}
                  placeholder="Generated summary/report appears here..."
                  className="h-full w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                />
              ) : (
                <div className="flex h-full min-h-[36rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
                    <span>Rich text editor</span>
                    <span>{hasGeneratedOutput ? "Click into any text to edit — changes sync to the LaTeX source" : "Waiting for generated output"}</span>
                  </div>
                  {hasGeneratedOutput && (
                    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-4 py-1.5">
                      {[
                        { label: "Undo", Icon: Undo2, onClick: undoEdit },
                        { label: "Redo", Icon: Redo2, onClick: redoEdit },
                      ].map(({ label, Icon, onClick }) => (
                        <button
                          key={label}
                          type="button"
                          title={label}
                          aria-label={label}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={onClick}
                          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Icon size={15} />
                        </button>
                      ))}
                      <span className="mx-1 h-4 w-px bg-slate-200" />
                      {[
                        { tag: "strong", label: "Bold", Icon: Bold },
                        { tag: "em", label: "Italic", Icon: Italic },
                        { tag: "u", label: "Underline", Icon: Underline },
                        { tag: "s", label: "Strikethrough", Icon: Strikethrough },
                        { tag: "mark", label: "Highlight", Icon: Highlighter },
                        { tag: "code", label: "Inline code", Icon: Code },
                        { tag: "sup", label: "Superscript", Icon: Superscript },
                        { tag: "sub", label: "Subscript", Icon: Subscript },
                      ].map(({ tag, label, Icon }) => (
                        <button
                          key={tag}
                          type="button"
                          title={label}
                          aria-label={label}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyInlineFormat(tag)}
                          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Icon size={15} />
                        </button>
                      ))}
                      <span className="mx-1 h-4 w-px bg-slate-200" />
                      {[
                        { label: "Heading", Icon: Heading, onClick: () => applyBlockFormat("formatBlock", "H4") },
                        { label: "Quote", Icon: Quote, onClick: () => applyBlockFormat("formatBlock", "BLOCKQUOTE") },
                        { label: "Bullet list", Icon: List, onClick: () => applyBlockFormat("insertUnorderedList") },
                        { label: "Numbered list", Icon: ListOrdered, onClick: () => applyBlockFormat("insertOrderedList") },
                      ].map(({ label, Icon, onClick }) => (
                        <button
                          key={label}
                          type="button"
                          title={label}
                          aria-label={label}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={onClick}
                          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Icon size={15} />
                        </button>
                      ))}
                      <span className="mx-1 h-4 w-px bg-slate-200" />
                      {[
                        { label: "Insert table", Icon: Table, onClick: insertTable },
                        { label: "Insert code block", Icon: Braces, onClick: insertCodeBlock },
                        { label: "Insert equation", Icon: Sigma, onClick: insertEquation },
                      ].map(({ label, Icon, onClick }) => (
                        <button
                          key={label}
                          type="button"
                          title={label}
                          aria-label={label}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={onClick}
                          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Icon size={15} />
                        </button>
                      ))}
                      <span className="mx-1 h-4 w-px bg-slate-200" />
                      {[
                        { label: "Add row", Icon: Rows3, onClick: addTableRow, tint: "text-emerald-600" },
                        { label: "Delete row", Icon: Rows3, onClick: deleteTableRow, tint: "text-red-600" },
                        { label: "Add column", Icon: Columns3, onClick: addTableColumn, tint: "text-emerald-600" },
                        { label: "Delete column", Icon: Columns3, onClick: deleteTableColumn, tint: "text-red-600" },
                      ].map(({ label, Icon, onClick, tint }) => (
                        <button
                          key={label}
                          type="button"
                          title={label}
                          aria-label={label}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={onClick}
                          className="relative rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Icon size={15} />
                          <span className={`absolute -bottom-0.5 -right-0.5 text-[9px] font-bold leading-none ${tint}`}>
                            {label.startsWith("Add") ? "+" : "−"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto bg-slate-200/70 p-4">
                    {!hasGeneratedOutput ? (
                      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                        Generate a report to start editing here.
                      </div>
                    ) : (
                      <article
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={handleArticleBlur}
                        className="ngn-doc-article mx-auto min-h-full max-w-3xl rounded-xl border border-slate-300 bg-white p-10 shadow-lg"
                        dangerouslySetInnerHTML={{ __html: renderArticleHtml(previewDoc) }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {hasGeneratedOutput && (
              <div className="border-t border-slate-100 px-4 py-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Add edits</div>
                  <textarea
                    value={editRequest}
                    onChange={(e) => setEditRequest(e.target.value)}
                    rows={3}
                    placeholder="Ask for changes, e.g. add a comparison table, remove the Risk section, add a code box for API usage..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-blue-500/30"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500">Applies edits to the current generated document.</p>
                    <button
                      onClick={handleApplyEdits}
                      disabled={applyingEdits}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white ${applyingEdits ? "cursor-not-allowed bg-slate-400" : "bg-brand-blue-600 hover:bg-brand-blue-700"}`}
                    >
                      {applyingEdits ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {applyingEdits ? "Applying edits..." : "Apply edits"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 px-4 py-3">
              <button
                onClick={handleNewDocument}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Plus size={14} /> New document
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
