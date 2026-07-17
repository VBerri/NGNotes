import io
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from docx import Document as DocxDocument
from fastapi.testclient import TestClient

from app.main import (
    GenerationFailedError,
    LatexCompileError,
    _build_prompt,
    _compile_latex_pdf,
    _escape_stray_ampersands,
    _escape_stray_latex_specials,
    _extract_latex_error_detail,
    _extract_office_text,
    _extract_title,
    _has_unbalanced_braces,
    _latex_escape,
    _normalize_asm_lstlisting_options,
    _normalize_environment_typos,
    _normalize_ollama_options,
    _normalize_stacked_decorations,
    _normalize_tabular_columns,
    _safe_filename_stem,
    _sanitize_latex_body,
    _source_indicates_code_blocks,
    _to_pdflatex_safe_text,
    _wrap_latex_document,
    app,
)
from app.schemas import GenerateRequest


client = TestClient(app)


# ---------------------------------------------------------------------------
# _latex_escape
# ---------------------------------------------------------------------------

class TestLatexEscape:
    def test_escapes_special_characters(self):
        assert _latex_escape("50% & #1 _var {x}") == r"50\% \& \#1 \_var \{x\}"

    def test_backslash_is_escaped_without_corrupting_other_escapes(self):
        # A literal backslash must become \textbackslash{}, not interfere with
        # the other substitutions that run after it (regression: an earlier
        # bug used a raw NUL-byte sentinel here).
        assert _latex_escape("a\\b_c") == r"a\textbackslash{}b\_c"

    def test_tilde_and_caret(self):
        assert _latex_escape("~x^y") == r"\textasciitilde{}x\textasciicircum{}y"

    def test_empty_and_none(self):
        assert _latex_escape("") == ""
        assert _latex_escape(None) == ""


# ---------------------------------------------------------------------------
# _has_unbalanced_braces
# ---------------------------------------------------------------------------

class TestUnbalancedBraces:
    def test_balanced(self):
        assert _has_unbalanced_braces(r"\section{Title} some \textbf{bold} text") is False

    def test_unbalanced_missing_close(self):
        assert _has_unbalanced_braces(r"\section{Title unbalanced") is True

    def test_unbalanced_extra_close(self):
        assert _has_unbalanced_braces(r"text} extra close") is True

    def test_escaped_braces_do_not_count(self):
        assert _has_unbalanced_braces(r"literal \{ and \} braces") is False

    def test_listing_body_braces_are_ignored(self):
        src = "\\begin{lstlisting}\nif (x) { return 1; }\n\\end{lstlisting}\n\\section{OK}"
        assert _has_unbalanced_braces(src) is False


# ---------------------------------------------------------------------------
# _escape_stray_ampersands
# ---------------------------------------------------------------------------

class TestAmpersandEscaping:
    def test_prose_ampersand_is_escaped(self):
        out = _escape_stray_ampersands("Our R&D team works with Q&A.")
        assert "R\\&D" in out
        assert "Q\\&A" in out

    def test_table_separators_are_preserved(self):
        src = "\\begin{tabular}{ll}\nAlpha & Beta \\\\\n\\end{tabular}"
        assert _escape_stray_ampersands(src) == src

    def test_listing_ampersands_preserved(self):
        src = "\\begin{lstlisting}\nif (a && b) { run(); }\n\\end{lstlisting}"
        assert _escape_stray_ampersands(src) == src

    def test_math_ampersands_preserved(self):
        src = "See $a & b$ for detail."
        assert _escape_stray_ampersands(src) == src

    def test_already_escaped_not_doubled(self):
        assert _escape_stray_ampersands(r"Already \& fine") == r"Already \& fine"

    def test_table_with_inline_math_cell_stays_intact(self):
        src = (
            "Our R&D group.\n"
            "\\begin{tabular}{ll}\n"
            "Metric & Value \\\\\n"
            "Latency $x^{2}$ & 12 \\\\\n"
            "\\end{tabular}\n"
        )
        out = _escape_stray_ampersands(src)
        assert "R\\&D" in out
        assert "Metric & Value" in out
        assert "Latency $x^{2}$ & 12" in out


# ---------------------------------------------------------------------------
# _normalize_tabular_columns
# ---------------------------------------------------------------------------

class TestNormalizeTabularColumns:
    def test_adds_grid_spec_and_hline_per_row(self):
        src = "\\begin{tabular}{ll}\nAlpha & Beta \\\\\nGamma & Delta \\\\\n\\end{tabular}"
        out = _normalize_tabular_columns(src)
        assert "\\begin{tabular}{|l|l|}" in out
        assert out.count("\\hline") == 3  # one before the first row + one per row
        assert "Alpha & Beta \\\\ \\hline" in out
        assert "Gamma & Delta \\\\ \\hline" in out

    def test_pads_short_rows_to_the_widest_row(self):
        # A row with fewer & separators than the widest row is exactly the
        # "Extra alignment tab has been changed to \cr" failure mode.
        src = "\\begin{tabular}{ll}\nA & B & C \\\\\nD & E \\\\\n\\end{tabular}"
        out = _normalize_tabular_columns(src)
        assert "\\begin{tabular}{|l|l|l|}" in out
        assert "D & E &  \\\\ \\hline" in out

    def test_leaves_non_tabular_content_untouched(self):
        src = "\\section{X} some prose with no tables at all."
        assert _normalize_tabular_columns(src) == src

    def test_leaves_tabularx_and_longtable_untouched(self):
        # Scoped to plain tabular only — tabularx/longtable have multi-page and
        # width-spec features a blind rebuild could break.
        src = "\\begin{longtable}{ll}\nA & B \\\\\n\\end{longtable}"
        assert _normalize_tabular_columns(src) == src

    def test_empty_table_is_left_unchanged(self):
        src = "\\begin{tabular}{ll}\n\\end{tabular}"
        assert _normalize_tabular_columns(src) == src

    def test_end_to_end_via_sanitize_latex_body_compiles(self):
        body = _sanitize_latex_body(
            r"\section{Results}"
            r"\begin{tabular}{ll}"
            r"Metric & Value & Extra \\"
            r"Latency & 12 \\"
            r"\end{tabular}"
        )
        assert "{|l|l|l|}" in body
        pdf_bytes = _compile_latex_pdf(body)
        assert pdf_bytes[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# _normalize_stacked_decorations (stacked underline/strikeout/highlight)
# ---------------------------------------------------------------------------

class TestNormalizeStackedDecorations:
    def test_two_stacked_decorations_collapse_to_single_ngdecorate_pass(self):
        out = _normalize_stacked_decorations(r"\uline{\nghighlight{some text}}")
        assert out == r"\ngdecorate{\ngmarkHL\ngmarkUL}{some text}"

    def test_nesting_order_does_not_matter(self):
        a = _normalize_stacked_decorations(r"\uline{\sout{x}}")
        b = _normalize_stacked_decorations(r"\sout{\uline{x}}")
        assert a == b == r"\ngdecorate{\ngmarkUL\ngmarkSO}{x}"

    def test_font_command_inside_decoration_is_hoisted_outside(self):
        # \uline{\textbf{long...}} is one unbreakable hbox (~699pt overfull);
        # the reverse order wraps, so the font must move outside.
        out = _normalize_stacked_decorations(r"\uline{\textbf{bold under}}")
        assert out == r"\textbf{\uline{bold under}}"

    def test_partial_font_inside_decoration_splits_the_run(self):
        out = _normalize_stacked_decorations(r"\uline{a \textbf{b} c}")
        assert out == r"\uline{a }\textbf{\uline{b}}\uline{ c}"

    def test_single_decorations_keep_native_commands(self):
        src = r"\uline{a} \sout{b} \nghighlight{c}"
        assert _normalize_stacked_decorations(src) == src

    def test_all_five_formats_stack_into_fonts_outside_single_deco_pass(self):
        out = _normalize_stacked_decorations(
            r"\textbf{\textit{\uline{\nghighlight{\sout{words}}}}}"
        )
        assert out == r"\textbf{\textit{\ngdecorate{\ngmarkHL\ngmarkUL\ngmarkSO}{words}}}"

    def test_superscript_inside_decoration_is_hoisted(self):
        # \textsuperscript inside any ulem argument is a hard "Extra }"
        # compile error in stock ulem (isolated by direct pdflatex test).
        out = _normalize_stacked_decorations(r"\uline{x\textsuperscript{2} y}")
        assert out == r"\uline{x}\textsuperscript{\uline{2}}\uline{ y}"

    def test_math_span_stays_inside_the_decorated_run(self):
        out = _normalize_stacked_decorations(r"\uline{\sout{a $E = mc^2$ b}}")
        assert out == r"\ngdecorate{\ngmarkUL\ngmarkSO}{a $E = mc^2$ b}"

    def test_texttt_inside_decoration_stays_inside_untouched(self):
        out = _normalize_stacked_decorations(r"\uline{\nghighlight{see \texttt{ptr\_addr} here}}")
        assert out == r"\ngdecorate{\ngmarkHL\ngmarkUL}{see \texttt{ptr\_addr} here}"

    def test_lstlisting_bodies_are_left_verbatim(self):
        src = "\\begin{lstlisting}\n\\uline{\\sout{code}}\n\\end{lstlisting}"
        assert _normalize_stacked_decorations(src) == src

    def test_legacy_ul_hl_aliases_are_normalized_too(self):
        out = _normalize_stacked_decorations(r"\ul{\hl{x}}")
        assert out == r"\ngdecorate{\ngmarkHL\ngmarkUL}{x}"

    def test_unbalanced_braces_left_untouched(self):
        src = r"\uline{\textbf{missing close"
        assert _normalize_stacked_decorations(src) == src

    def test_end_to_end_stacked_formats_compile_without_overfull_hbox(self):
        # The user-visible bug this pass fixes: ANY combination of underline/
        # bold/italic/strikethrough/highlight on one long run rendered as a
        # single unbreakable hbox running 544-699pt off the page margin,
        # because ulem decorations don't nest (each \ULon treats any inner
        # brace group — another ulem command or \textbf{...} — as one
        # unbreakable chunk). _compile_latex_pdf can't surface layout
        # warnings, so compile the wrapped document directly and assert the
        # log holds no Overfull \hbox at all.
        long_run = (
            "a fairly long sentence that needs to wrap across at least two or "
            "three lines to prove whether this combination of formatting "
            "commands stacked together still breaks line-breaking or instead "
            "runs off the page margin"
        )
        combos = [
            r"\nghighlight{\uline{%s}}",
            r"\uline{\sout{%s}}",
            r"\sout{\nghighlight{%s}}",
            r"\uline{\textbf{%s}}",
            r"\nghighlight{\textbf{\textit{%s}}}",
            r"\textbf{\textit{\uline{\nghighlight{\sout{%s}}}}}",
            r"\sout{\uline{\nghighlight{\textbf{\textit{%s}}}}}",
        ]
        body = "\n\n".join(c % long_run for c in combos)
        doc = _to_pdflatex_safe_text(_wrap_latex_document(_normalize_stacked_decorations(body)))
        with tempfile.TemporaryDirectory(prefix="ngnotes_decotest_") as tmpdir:
            tex_path = Path(tmpdir) / "deco.tex"
            tex_path.write_text(doc, encoding="utf-8")
            proc = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "deco.tex"],
                cwd=tmpdir, capture_output=True, text=True, check=False,
            )
            log = (Path(tmpdir) / "deco.log").read_text(encoding="utf-8", errors="ignore")
            assert proc.returncode == 0, log[-2000:]
            assert not re.search(r"Overfull \\hbox", log), re.findall(
                r"Overfull \\hbox.*", log
            )
            assert (Path(tmpdir) / "deco.pdf").read_bytes()[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# _source_indicates_code_blocks (reverse-engineering / assembly / Windows paths)
# ---------------------------------------------------------------------------

class TestSourceIndicatesCodeBlocks:
    def test_detects_disassembly_notes_with_hex_addresses_and_registers(self):
        note = (
            "sub_403020 - the interesting one\n"
            "0x403020: push ebp\n"
            "0x403026: mov eax, [ebp+8]\n"
            'call from 0x401550 with key = "MyS3cr3tK3y"\n'
        )
        assert _source_indicates_code_blocks(note) is True

    def test_detects_windows_backslash_paths(self):
        note = "The payload writes to C:\\Users\\victim\\AppData\\Local\\Temp\\svc.exe on execution."
        assert _source_indicates_code_blocks(note) is True

    def test_detects_bare_register_names(self):
        assert _source_indicates_code_blocks("value ends up in eax after the call") is True

    def test_detects_ida_style_symbol_names(self):
        assert _source_indicates_code_blocks("cross-referenced from loc_401550 and sub_403020") is True

    def test_does_not_false_positive_on_plain_english(self):
        note = "We had a great meeting today and decided to push the release or wait until Monday."
        assert _source_indicates_code_blocks(note) is False

    def test_detects_short_hex_byte_sequences(self):
        # Regression: a stray magic-number byte sequence like this used to
        # need 3+ hex digits per token (0x403020-style addresses); 2-digit
        # bytes (0xDE, 0xAD, ...) fell through every signal, which caused
        # _prune_unnecessary_lstlisting to flatten a legitimate lstlisting
        # code block back into plain prose.
        assert _source_indicates_code_blocks("0xDE, 0xAD, 0xBE, 0xEF") is True
        assert _source_indicates_code_blocks("0xCA, 0xFE, 0xBA, 0xBE") is True


# ---------------------------------------------------------------------------
# _normalize_asm_lstlisting_options
# ---------------------------------------------------------------------------

class TestNormalizeAsmLstlistingOptions:
    def test_rewrites_bare_language_assembler(self):
        src = "\\begin{lstlisting}[language=Assembler]\nmov eax, ebx\n\\end{lstlisting}"
        out = _normalize_asm_lstlisting_options(src)
        assert "[style=ngnasm]" in out
        assert "language=Assembler" not in out

    def test_rewrites_doubly_broken_nested_bracket_form(self):
        src = "\\begin{lstlisting}[language=[x86masm]Assembler]\nxor eax, eax\n\\end{lstlisting}"
        out = _normalize_asm_lstlisting_options(src)
        assert out == "\\begin{lstlisting}[style=ngnasm]\nxor eax, eax\n\\end{lstlisting}"

    def test_leaves_other_languages_untouched(self):
        src = "\\begin{lstlisting}[language=Python]\nprint('hi')\n\\end{lstlisting}"
        assert _normalize_asm_lstlisting_options(src) == src

    def test_end_to_end_via_sanitize_and_compile(self):
        body = _sanitize_latex_body(
            r"\section{Disassembly}"
            "\\begin{lstlisting}[language=Assembler]\n"
            "0x403020: push ebp\n"
            "0x403023: mov ebp, esp\n"
            "\\end{lstlisting}"
        )
        assert "style=ngnasm" in body
        pdf_bytes = _compile_latex_pdf(body)
        assert pdf_bytes[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# _normalize_environment_typos
# ---------------------------------------------------------------------------

class TestNormalizeEnvironmentTypos:
    def test_fixes_dropped_letter_typo(self):
        # Real observed model output: \end{lstisting} (missing an "l") doesn't
        # match \end{lstlisting}. Confirmed via direct pdflatex testing that
        # this produces NO compile error at all -- `listings` scans verbatim
        # for the literal closing string, so a typo'd end tag makes it
        # silently swallow everything after it (prose, a second code block,
        # anything) as code content until some later \end{} happens to match.
        src = "\\begin{lstlisting}\n0xDE, 0xAD\n\\end{lstisting}\nMore text.\n\\begin{lstlisting}\n0xCA\n\\end{lstlisting}"
        out = _normalize_environment_typos(src)
        assert out.count("\\begin{lstlisting}") == 2
        assert out.count("\\end{lstlisting}") == 2
        assert "lstisting" not in out

    def test_leaves_correctly_matched_environments_untouched(self):
        src = "\\begin{itemize}\n\\item A\n\\end{itemize}\n\\begin{lstlisting}\ncode\n\\end{lstlisting}"
        assert _normalize_environment_typos(src) == src

    def test_does_not_touch_unrelated_end_tag_when_nothing_is_open(self):
        # No matching \begin at all -- must not "correct" this into some
        # arbitrary known environment name just because it's nearby in the
        # known-environments list.
        src = "stray \\end{lstlisting} with nothing open before it"
        assert _normalize_environment_typos(src) == src

    def test_corrects_toward_whichever_environment_is_actually_open(self):
        # tabular vs tabularx are only 1 character apart -- must correct
        # toward the one that was actually opened, not just "the nearest
        # known name" in the abstract.
        src = "\\begin{tabularx}{\\linewidth}{ll}\nA & B \\\\\n\\end{tabular}"
        out = _normalize_environment_typos(src)
        assert "\\end{tabularx}" in out

    def test_end_to_end_matches_reported_bug_exactly(self):
        # The exact structure reported: two lstlisting blocks (hex magic
        # sequences) separated by prose with \texttt{} identifiers, where the
        # first block's end tag is typo'd.
        src = (
            r"\section{Analysis}"
            "\\begin{lstlisting}\n0xDE, 0xAD, 0xBE, 0xEF\n\\end{lstisting}\n"
            r"When the sequence matches, the routine sets an \texttt{unlock_mode} flag."
            "\n\\begin{lstlisting}\n0xCA, 0xFE, 0xBA, 0xBE\n\\end{lstlisting}"
        )
        body = _sanitize_latex_body(src)
        assert body.count("\\begin{lstlisting}") == 2
        # The prose must sit between the two code blocks, not be swallowed
        # into either one of them.
        first_end = body.index("\\end{lstlisting}")
        second_begin = body.index("\\begin{lstlisting}", first_end)
        between = body[first_end:second_begin]
        assert "unlock" in between
        pdf_bytes = _compile_latex_pdf(body)
        assert pdf_bytes[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# _escape_stray_latex_specials
# ---------------------------------------------------------------------------

class TestEscapeStrayLatexSpecials:
    def test_escapes_percent_hash_underscore(self):
        out = _escape_stray_latex_specials("50% of module_x uses feature #1")
        assert out == r"50\% of module\_x uses feature \#1"

    def test_leaves_well_formed_math_untouched(self):
        out = _escape_stray_latex_specials("Formula $a_b + c\\%$ stays raw")
        assert "$a_b + c\\%$" in out

    def test_leaves_listing_body_untouched(self):
        src = "\\begin{lstlisting}\nfoo_bar(x) # comment\n\\end{lstlisting}"
        assert _escape_stray_latex_specials(src) == src

    def test_unpaired_dollar_is_soft_repaired_not_raised(self):
        # A stray unpaired '$' used to hard-fail the whole export
        # (GenerationFailedError) over one leftover character; it's now
        # escaped to a literal dollar sign instead — a self-healing degrade.
        out = _escape_stray_latex_specials("This costs $50 total")
        assert out == r"This costs \$50 total"

    def test_escapes_bare_caret_outside_math(self):
        out = _escape_stray_latex_specials("Complexity is O(n^2) in the worst case")
        assert out == r"Complexity is O(n\textasciicircum{}2) in the worst case"

    def test_leaves_caret_in_well_formed_math_untouched(self):
        out = _escape_stray_latex_specials("Formula $x^2 + y^2$ stays raw")
        assert "$x^2 + y^2$" in out


# ---------------------------------------------------------------------------
# _extract_title
# ---------------------------------------------------------------------------

class TestExtractTitle:
    def test_extracts_simple_title(self):
        assert _extract_title(r"\title{My Report} \section{X}") == "My Report"

    def test_extracts_title_with_nested_braces(self):
        assert _extract_title(r"\title{Report on \textbf{X}} more") == r"Report on \textbf{X}"

    def test_returns_none_when_absent(self):
        assert _extract_title(r"\section{No title here}") is None


# ---------------------------------------------------------------------------
# _sanitize_latex_body
# ---------------------------------------------------------------------------

class TestSanitizeLatexBody:
    def test_empty_input_raises(self):
        with pytest.raises(GenerationFailedError):
            _sanitize_latex_body("")

    def test_missing_section_raises(self):
        with pytest.raises(GenerationFailedError, match="no \\\\section"):
            _sanitize_latex_body("just plain prose, no structure")

    def test_unbalanced_braces_raises_distinct_message(self):
        with pytest.raises(GenerationFailedError, match="unbalanced braces"):
            _sanitize_latex_body(r"\section{X} unbalanced { brace")

    def test_valid_document_round_trips(self):
        src = r"\title{T}\author{A}\date{\today}\maketitle\section{Intro}Some body text."
        out = _sanitize_latex_body(src)
        assert "\\section{Intro}" in out
        assert "Some body text." in out

    def test_strips_documentclass_and_usepackage(self):
        src = (
            "\\documentclass{article}\n\\usepackage{amsmath}\n"
            "\\begin{document}\n\\section{X}\nbody\n\\end{document}"
        )
        out = _sanitize_latex_body(src)
        assert "documentclass" not in out
        assert "usepackage" not in out

    def test_ampersand_in_prose_escaped_end_to_end(self):
        src = r"\section{Team} Our R&D group hit 95% coverage on module_x."
        out = _sanitize_latex_body(src)
        assert r"R\&D" in out
        assert r"95\%" in out
        assert r"module\_x" in out

    def test_removes_dangerous_shell_commands(self):
        src = r"\section{X}\write18{rm -rf /}\input{/etc/passwd}body text"
        out = _sanitize_latex_body(src)
        assert "write18" not in out
        assert "\\input{" not in out


# ---------------------------------------------------------------------------
# _extract_latex_error_detail
# ---------------------------------------------------------------------------

class TestExtractLatexErrorDetail:
    def test_extracts_message_and_exact_source_line(self):
        log = (
            "This is pdfTeX\n"
            "! Undefined control sequence.\n"
            "l.42 \\foobarbaz\n"
            "          {oops}\n"
        )
        doc_lines = ["" for _ in range(41)] + ["This has an undefined command \\foobarbaz{oops} in it."]
        detail = _extract_latex_error_detail(log, doc_lines)
        assert "Undefined control sequence." in detail
        assert "This has an undefined command \\foobarbaz{oops} in it." in detail

    def test_falls_back_gracefully_with_no_match(self):
        detail = _extract_latex_error_detail("no error markers here", [])
        assert "compile error" in detail.lower()


# ---------------------------------------------------------------------------
# _normalize_ollama_options
# ---------------------------------------------------------------------------

class TestNormalizeOllamaOptions:
    def test_aliases_max_tokens_and_repetition_penalty(self):
        opts = _normalize_ollama_options(
            {"temperature": 0.3, "max_tokens": 8192.0, "repetition_penalty": 1.03, "top_k": 40.0, "min_p": 0.05}
        )
        assert opts == {
            "temperature": 0.3,
            "num_predict": 8192,
            "repeat_penalty": 1.03,
            "top_k": 40,
            "min_p": 0.05,
        }

    def test_non_numeric_int_field_is_dropped_not_crashed(self):
        opts = _normalize_ollama_options({"max_tokens": "not-a-number"})
        assert "num_predict" not in opts

    def test_low_num_predict_is_floored(self):
        # Regression: a thinking-capable model can exhaust a small num_predict
        # entirely on internal reasoning and never emit a real answer. A
        # client-supplied cap below the floor must be raised, not honored as-is.
        opts = _normalize_ollama_options({"max_tokens": 900})
        assert opts["num_predict"] == 4096

    def test_num_predict_above_floor_is_left_untouched(self):
        opts = _normalize_ollama_options({"max_tokens": 12000})
        assert opts["num_predict"] == 12000


# ---------------------------------------------------------------------------
# _build_prompt
# ---------------------------------------------------------------------------

class TestBuildPrompt:
    def test_strips_dead_engineering_note_placeholder(self):
        req = GenerateRequest(
            engineering_note="x" * 30,
            model="m",
            user_prompt_template="Lead writer. Source notes:\n{engineering_note}",
        )
        prompt = _build_prompt(req, None, None, True, "the actual notes go here")
        assert "{engineering_note}" not in prompt
        assert "the actual notes go here" in prompt

    def test_source_notes_wrapped_in_delimiters(self):
        req = GenerateRequest(engineering_note="x" * 30, model="m")
        prompt = _build_prompt(req, None, None, True, "sensitive notes")
        assert "<<<NOTES" in prompt
        assert "NOTES>>>" in prompt
        assert "sensitive notes" in prompt


# ---------------------------------------------------------------------------
# pdflatex compile (real, no mocking — uses the installed TinyTeX toolchain)
# ---------------------------------------------------------------------------

class TestCompileLatexPdf:
    def test_valid_document_compiles(self):
        body = _sanitize_latex_body(
            r"\title{T}\author{A}\date{\today}\maketitle\section{Intro}Body content."
        )
        pdf_bytes = _compile_latex_pdf(body)
        assert pdf_bytes[:4] == b"%PDF"
        assert len(pdf_bytes) > 1024

    def test_undefined_command_raises_with_exact_line(self):
        body = r"\section{Test}This has an undefined command \foobarbaz{oops} in it."
        with pytest.raises(LatexCompileError) as exc_info:
            _compile_latex_pdf(body)
        message = str(exc_info.value)
        assert "Undefined control sequence" in message
        assert "\\foobarbaz{oops}" in message

    def test_table_with_ampersand_and_math_compiles(self):
        body = _sanitize_latex_body(
            r"\section{Overview}"
            r"Our R&D team reports 40% coverage on module_x, working with Q&A."
            r"\begin{tabular}{ll}"
            r"Team & Focus \\"
            r"Research $x^{2}$ & Support \\"
            r"\end{tabular}"
        )
        pdf_bytes = _compile_latex_pdf(body)
        assert pdf_bytes[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# _extract_office_text (cross-platform .docx/.rtf/.doc extraction)
# ---------------------------------------------------------------------------

def _make_docx_bytes(paragraphs):
    doc = DocxDocument()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


class TestExtractOfficeText:
    def test_docx_extracts_paragraph_text(self):
        data = _make_docx_bytes(["Section One", "Some body content here."])
        text = _extract_office_text(data, ".docx")
        assert "Section One" in text
        assert "Some body content here." in text

    def test_rtf_extracts_plain_text(self):
        rtf = rb"{\rtf1\ansi\deff0 {\fonttbl{\f0 Times New Roman;}} \f0\pard This is \b bold\b0  RTF text.\par}"
        text = _extract_office_text(rtf, ".rtf")
        assert "This is" in text
        assert "bold" in text
        assert "RTF text." in text

    def test_unsupported_suffix_raises(self):
        with pytest.raises(ValueError):
            _extract_office_text(b"whatever", ".xyz")

    @pytest.mark.skipif(sys.platform == "darwin", reason="macOS has a textutil fallback for legacy .doc")
    def test_doc_unsupported_off_macos_raises_actionable_error(self):
        with pytest.raises(RuntimeError, match="save as .docx"):
            _extract_office_text(b"not a real doc file", ".doc")


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

class TestSafeFilenameStem:
    def test_spaces_become_underscores_not_dropped(self):
        assert _safe_filename_stem("Login Session TTL Fix") == "Login_Session_TTL_Fix"

    def test_strips_latex_markup_and_special_chars(self):
        assert _safe_filename_stem(r"R\&D \textbf{Report}!") == "RD_textbfReport"

    def test_collapses_repeated_underscores_and_trims_edges(self):
        assert _safe_filename_stem("  weird   spacing  ") == "weird_spacing"

    def test_empty_input_yields_empty_string(self):
        assert _safe_filename_stem("") == ""
        assert _safe_filename_stem(None) == ""


class TestApiEndpoints:
    def test_health(self):
        res = client.get("/api/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}

    def test_export_pdf_filename_reflects_document_title(self):
        res = client.post(
            "/api/export-pdf",
            json={
                "summary": r"\title{Login Session TTL Fix}\author{NGNotes}\date{\today}\maketitle\section{Overview}Body text.",
                "filename": "ngnotes_report",
            },
        )
        assert res.status_code == 200
        disposition = res.headers["content-disposition"]
        assert "Login_Session_TTL_Fix" in disposition
        assert res.headers["x-report-title"] == "Login Session TTL Fix"

    def test_export_pdf_falls_back_to_generic_name_without_title(self):
        res = client.post(
            "/api/export-pdf",
            json={"summary": r"\section{Overview}Body text with no title command."},
        )
        assert res.status_code == 200
        disposition = res.headers["content-disposition"]
        assert "Engineering_Report" in disposition

    def test_export_pdf_exposes_filename_headers_cross_origin(self):
        # Content-Disposition/X-Report-Title aren't in the browser's default CORS
        # response-header safelist; without an explicit expose_headers entry the
        # frontend's res.headers.get(...) silently returns null on every
        # cross-origin request (the dev UI and backend run on different ports),
        # and every download falls back to a generic filename no matter what the
        # backend computed.
        res = client.post(
            "/api/export-pdf",
            json={"summary": r"\title{Title}\section{Overview}Body text."},
            headers={"Origin": "http://127.0.0.1:5173"},
        )
        assert res.status_code == 200
        exposed = res.headers.get("access-control-expose-headers", "")
        assert "content-disposition" in exposed.lower()
        assert "x-report-title" in exposed.lower()

    def test_export_pdf_success(self):
        res = client.post(
            "/api/export-pdf",
            json={
                "summary": r"\section{Overview}Our R&D team hit 95% coverage on module_x.",
                "filename": "test_report",
            },
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"
        assert res.content[:4] == b"%PDF"

    def test_export_pdf_reports_exact_line_on_compile_error(self):
        res = client.post(
            "/api/export-pdf",
            json={
                "summary": r"\section{Test}This has an undefined command \foobarbaz{oops} in it.",
                "filename": "broken",
            },
        )
        assert res.status_code == 422
        detail = res.json()["detail"]
        assert "Undefined control sequence" in detail
        assert "\\foobarbaz{oops}" in detail

    def test_export_pdf_rejects_structureless_summary(self):
        res = client.post("/api/export-pdf", json={"summary": "no sections here"})
        assert res.status_code == 422
        assert "section" in res.json()["detail"].lower()

    def test_generate_rejects_short_note(self):
        res = client.post(
            "/api/generate",
            json={"engineering_note": "too short", "model": "any-model"},
        )
        assert res.status_code == 422

    def test_report_templates_lists_curated_frameworks(self):
        res = client.get("/api/report-templates")
        assert res.status_code == 200
        assert "templates" in res.json()

    def test_save_and_delete_custom_template(self):
        create = client.post(
            "/api/report-templates",
            json={"name": "Pytest Temp Template", "headings": ["Intro", "Findings"]},
        )
        assert create.status_code == 200
        template_id = create.json()["id"]

        preview = client.get(f"/api/report-templates/{template_id}/preview")
        assert preview.status_code == 200
        assert "Intro" in preview.json()["preview_text"]

        delete = client.delete(f"/api/report-templates/{template_id}")
        assert delete.status_code == 200

        missing = client.get(f"/api/report-templates/{template_id}/preview")
        assert missing.status_code == 404
