# NGNotes User Guide

This is a walkthrough of how to actually use the app once it's running (see [README.md](README.md) for how to install and start it).

## 1. Before you generate anything

At the top of the page:

- **Ollama Backend URL** — leave this as-is unless you moved the backend to a different address.
- **Model** — pick from whatever models you've pulled into Ollama (`ollama pull <model>`). If the dropdown says "No models loaded," Ollama isn't running or has no models installed.
- **Advanced** — opens sampler settings (temperature, top-k/p, repetition penalty, max tokens) and saved **presets** (see §6).

## 2. Adding your source material

The left panel, **Source Inputs**, is where your raw material goes. You can mix and match:

- **Upload note file** — import a `.txt`, `.md`, `.pdf`, `.docx`, `.json`, or `.xml` file. Its text gets pulled into a notes block automatically.
- **Voice input** — record audio right in the browser; it's transcribed to text, which you can then edit before generating.
- **Add raw notes block** — a plain text box. Add as many as you want — separate blocks for separate trains of thought are fine, they all get merged together.
- **Add image block** — upload a photo (a whiteboard, a hand-drawn diagram, an engineering drawing, a screenshot). Click **Analyze image** to have a vision-capable model describe it; the description is added as source material alongside your notes. Your model needs vision support (check `ollama list` — most modern general-purpose models like `qwen3.6` or `gemma4` include it).

Notes can be written in any register — casual, terse bullet points, formal prose — the generated report keeps your material's voice and tone rather than flattening everything into generic "AI report" language, while still writing everything in neutral third-person and without slang.

## 3. Templates

**Template Blocks** at the top of Source Inputs let you nudge the report's structure:

- **Auto** — the model infers the best-fit structure from your notes' content (works well for anything from an incident postmortem to a clinical note).
- **Medical / Engineering / Monthly Report** — built-in style guides.
- Any template you've **saved** yourself (see below) also shows up here, with a small **X** in the corner to delete it (with a confirmation prompt).

**Saving a template**: once you've generated and like a document's section structure, click **Save as template** in the Report Output panel. This saves only the *section headings*, not the content — so you can reuse "Introduction / Methodology / Results / Conclusion" as a shape for a totally different report later. Manage saved templates (rename, edit headings, delete) via **Manage saved** next to Template Blocks.

## 4. Generating

Click **Generate** at the bottom of Source Inputs. This can take anywhere from a few seconds to a couple of minutes depending on your model and note length — some models "think" before answering, which improves quality at the cost of time.

If generation fails, you'll get a specific reason (not just "something went wrong") — most commonly: source notes too short (needs at least 20 characters), no model selected, or Ollama unreachable.

## 5. The Report Output panel

Once generated, you get two views (toggle at the top):

### Preview (rich text editor)

Click directly into the title, author, date, abstract, or any section to edit — it behaves like a normal text editor. A formatting toolbar sits above it:

- **Undo / Redo**
- **Bold, Italic, Underline, Strikethrough, Highlight, Inline code, Superscript, Subscript**
- **Heading, Quote, Bullet list, Numbered list**
- **Insert table, Insert code block, Insert equation** (equation prompts for a LaTeX math expression and renders it live)
- **Table row/column controls** — click inside any table, then use Add/Delete row or column

Everything you type here is kept in sync with the underlying LaTeX — switch to Source view any time to see (or hand-edit) the raw LaTeX directly.

### Source

The raw LaTeX text, directly editable if you're comfortable with LaTeX syntax.

### Add edits

Below the editor, type a plain-English instruction ("add a comparison table," "remove the Risk section," "make the tone more formal") and click **Apply edits** — this sends your current document plus the instruction back to the model for a targeted revision, rather than starting over.

## 6. Advanced settings and presets

Open **Advanced** in the top bar to adjust generation behavior:

- **Temperature / Top-k / Top-p / Bottom-p / Repetition penalty** — standard LLM sampling controls.
- **Max tokens** — how much the model is allowed to generate. Reasoning-capable models spend part of this budget on internal "thinking" before writing the actual report, so don't set this too low or you risk getting an empty result.

If you land on settings you like, click **Save current as preset**, give it a name, and it'll be available to reapply with one click from then on (stored locally in your browser, not shared). Delete a preset with the **X** on its card.

## 7. Exporting to PDF

Click **Export PDF**. If the document has a formatting problem that would block compilation, NGNotes automatically attempts a silent, one-shot fix through the model before giving up — you'll see a brief "fixing it automatically" message rather than an immediate failure. If it still can't compile, the error message tells you the exact problem line so you can fix it by hand in Source view.

The downloaded file is named after the report's actual title (not a generic timestamp), e.g. `Login_Session_TTL_Fix_20260714.pdf`.

## 8. Starting over

**New Document**, at the bottom of the Source Inputs panel, clears everything — all input blocks, the generated output, and template selection — so you can start a fresh report from scratch.
