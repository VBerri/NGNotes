"""
NGNotes: PDF report generation for summarized engineering notes.

Renders a Run-Mode generation into a formatted, professional-looking PDF using
ReportLab Platypus. Understands a small subset of markdown emitted by the
prompt templates: ATX headings (#, ##, ###), bullet lines (- / *), numbered
lines (1. 2.), bold (**...**), and italic (*...*).
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Iterable, List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


GT_GOLD = colors.HexColor("#B3A369")
GT_NAVY = colors.HexColor("#003057")
GRAY_BORDER = colors.HexColor("#D1D5DB")
GRAY_TEXT = colors.HexColor("#374151")


@dataclass
class PdfReport:
    summary: str
    model: str
    mode: Optional[str] = None
    prompt_variant: Optional[str] = None
    engineering_note: Optional[str] = None
    image_description: Optional[str] = None
    generated_at: Optional[datetime] = None


# ── Markdown → reportlab inline conversion ──────────────────────────────────

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")


def _inline_md_to_rl(text: str) -> str:
    """Escape HTML and apply a tiny subset of inline markdown for Paragraph()."""
    escaped = html.escape(text or "")
    escaped = _BOLD_RE.sub(r"<b>\1</b>", escaped)
    escaped = _ITALIC_RE.sub(r"<i>\1</i>", escaped)
    escaped = _INLINE_CODE_RE.sub(
        r'<font face="Courier" color="#374151">\1</font>', escaped
    )
    return escaped


def _build_styles() -> dict:
    base = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=GRAY_TEXT,
        alignment=TA_LEFT,
        spaceAfter=4,
    )
    h1 = ParagraphStyle(
        "H1", parent=body, fontName="Helvetica-Bold", fontSize=16,
        leading=20, textColor=GT_NAVY, spaceBefore=10, spaceAfter=6,
    )
    h2 = ParagraphStyle(
        "H2", parent=body, fontName="Helvetica-Bold", fontSize=13,
        leading=17, textColor=GT_NAVY, spaceBefore=8, spaceAfter=5,
    )
    h3 = ParagraphStyle(
        "H3", parent=body, fontName="Helvetica-Bold", fontSize=11.5,
        leading=15, textColor=GT_NAVY, spaceBefore=6, spaceAfter=4,
    )
    bullet = ParagraphStyle(
        "Bullet", parent=body, leftIndent=14, bulletIndent=2, spaceAfter=2,
    )
    meta = ParagraphStyle(
        "Meta", parent=body, fontSize=9, textColor=colors.HexColor("#6B7280"),
        spaceAfter=0,
    )
    appendix_label = ParagraphStyle(
        "AppendixLabel", parent=body, fontName="Helvetica-Bold", fontSize=10,
        textColor=GT_NAVY, spaceBefore=8, spaceAfter=3,
    )
    return {
        "body": body, "h1": h1, "h2": h2, "h3": h3,
        "bullet": bullet, "meta": meta, "appendix_label": appendix_label,
    }


_BULLET_RE = re.compile(r"^\s*[-*]\s+(.*)$")
_NUM_RE = re.compile(r"^\s*(\d+)[.)]\s+(.*)$")
_H3_RE = re.compile(r"^###\s+(.*)$")
_H2_RE = re.compile(r"^##\s+(.*)$")
_H1_RE = re.compile(r"^#\s+(.*)$")


def _render_markdown_block(text: str, styles: dict) -> List:
    """Turn a markdown-ish string into a list of Platypus flowables."""
    flowables: List = []
    blank_run = 0

    for raw_line in (text or "").splitlines():
        line = raw_line.rstrip()

        if not line.strip():
            blank_run += 1
            if blank_run == 1:
                flowables.append(Spacer(1, 6))
            continue
        blank_run = 0

        m = _H1_RE.match(line)
        if m:
            flowables.append(Paragraph(_inline_md_to_rl(m.group(1)), styles["h1"]))
            continue
        m = _H2_RE.match(line)
        if m:
            flowables.append(Paragraph(_inline_md_to_rl(m.group(1)), styles["h2"]))
            continue
        m = _H3_RE.match(line)
        if m:
            flowables.append(Paragraph(_inline_md_to_rl(m.group(1)), styles["h3"]))
            continue

        m = _BULLET_RE.match(line)
        if m:
            flowables.append(
                Paragraph(_inline_md_to_rl(m.group(1)), styles["bullet"],
                          bulletText="•")
            )
            continue

        m = _NUM_RE.match(line)
        if m:
            flowables.append(
                Paragraph(_inline_md_to_rl(m.group(2)), styles["bullet"],
                          bulletText=f"{m.group(1)}.")
            )
            continue

        flowables.append(Paragraph(_inline_md_to_rl(line), styles["body"]))

    return flowables


# ── Page header / footer ────────────────────────────────────────────────────

def _make_page_decorator(report: PdfReport):
    timestamp = (report.generated_at or datetime.utcnow()).strftime("%Y-%m-%d %H:%M UTC")

    def _draw(canvas, doc):
        width, height = LETTER

        # Top gold accent stripe
        canvas.saveState()
        canvas.setFillColor(GT_GOLD)
        canvas.rect(0, height - 0.18 * inch, width, 0.18 * inch, stroke=0, fill=1)

        # Header text
        canvas.setFillColor(GT_NAVY)
        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(0.75 * inch, height - 0.55 * inch, "NGNotes — Engineering Summary Report")

        canvas.setFillColor(GRAY_TEXT)
        canvas.setFont("Helvetica", 9)
        meta_line = f"Model: {report.model}  |  Generated: {timestamp}"
        canvas.drawString(0.75 * inch, height - 0.72 * inch, meta_line)

        # Thin divider
        canvas.setStrokeColor(GRAY_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(0.75 * inch, height - 0.82 * inch, width - 0.75 * inch, height - 0.82 * inch)

        # Footer: page number + brand
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawString(0.75 * inch, 0.45 * inch, "NGNotes")
        canvas.drawRightString(
            width - 0.75 * inch, 0.45 * inch,
            f"Page {canvas.getPageNumber()}",
        )
        canvas.restoreState()

    return _draw


# ── Public API ──────────────────────────────────────────────────────────────

def build_summary_pdf(report: PdfReport) -> bytes:
    """Render ``report`` to PDF bytes."""
    buf = BytesIO()
    styles = _build_styles()

    doc = BaseDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=1.0 * inch,
        bottomMargin=0.75 * inch,
        title="NGNotes Engineering Summary",
        author="NGNotes",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id="body", showBoundary=0,
    )
    doc.addPageTemplates([
        PageTemplate(id="default", frames=[frame], onPage=_make_page_decorator(report)),
    ])

    flowables: List = []

    # Top meta block (mode / prompt variant) — render only if present.
    meta_bits: List[str] = []
    if report.mode:
        meta_bits.append(f"Mode: <b>{html.escape(report.mode)}</b>")
    if report.prompt_variant:
        meta_bits.append(f"Prompt variant: <b>{html.escape(report.prompt_variant)}</b>")
    if meta_bits:
        flowables.append(Paragraph("  ·  ".join(meta_bits), styles["meta"]))
        flowables.append(Spacer(1, 10))

    # Main body: the generated summary itself.
    flowables.append(Paragraph("Summary", styles["h1"]))
    flowables.extend(_render_markdown_block(report.summary, styles))

    # Optional appendices.
    if report.image_description and report.image_description.strip():
        flowables.append(Spacer(1, 12))
        flowables.append(Paragraph("Attached Image — Description", styles["h2"]))
        flowables.extend(_render_markdown_block(report.image_description, styles))

    if report.engineering_note and report.engineering_note.strip():
        flowables.append(PageBreak())
        flowables.append(Paragraph("Source Engineering Notes", styles["h2"]))
        flowables.extend(_render_markdown_block(report.engineering_note, styles))

    doc.build(flowables)
    return buf.getvalue()


def _fmt_metric(value: Optional[float]) -> str:
    return f"{value:.4f}" if value is not None else "-"


def _soft_wrap_model_name(name: str, chunk: int = 18) -> str:
    raw = (name or "-").strip()
    if not raw:
        return "-"
    parts = [raw[i:i + chunk] for i in range(0, len(raw), chunk)]
    return "<br/>".join(html.escape(p) for p in parts)


def _metric_chart(
    model_stats: list[dict], key: str, color: colors.Color, short_label_map: dict
) -> Optional[Drawing]:
    points = [(m.get("model", "-"), m.get(key)) for m in model_stats]
    points = [(name, value) for name, value in points if value is not None]
    if not points:
        return None

    names = [short_label_map.get(name, name[:8]) for name, _ in points]
    values = [float(v) for _, v in points]

    drawing = Drawing(500, 180)
    chart = VerticalBarChart()
    chart.x = 36
    chart.y = 34
    chart.height = 116
    chart.width = 430
    chart.data = [values]
    chart.categoryAxis.categoryNames = names
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 8
    chart.categoryAxis.labels.angle = 20
    chart.categoryAxis.labels.dy = -8
    chart.valueAxis.valueMin = 0.0
    upper = max(values) * 1.15
    chart.valueAxis.valueMax = max(1.0, round(upper, 2))
    chart.valueAxis.valueStep = max(0.1, round(chart.valueAxis.valueMax / 5.0, 2))
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 8
    chart.bars[0].fillColor = color
    drawing.add(chart)
    return drawing


def build_eval_stats_pdf(total_rows: int, model_stats: list[dict]) -> bytes:
    """Render deterministic evaluation statistics PDF with tables and charts."""
    buf = BytesIO()
    styles = _build_styles()

    report = PdfReport(
        summary="",
        model="deterministic-metrics",
        mode="Evaluation Stats Report",
        prompt_variant="raw runtime rows",
        generated_at=datetime.utcnow(),
    )

    doc = BaseDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=1.0 * inch,
        bottomMargin=0.75 * inch,
        title="NGNotes Evaluation Performance",
        author="NGNotes",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id="body", showBoundary=0,
    )
    doc.addPageTemplates([
        PageTemplate(id="default", frames=[frame], onPage=_make_page_decorator(report)),
    ])

    flowables: List = []
    flowables.append(Paragraph("Evaluation Performance Report", styles["h1"]))
    flowables.append(
        Paragraph(
            f"Rows analyzed: <b>{total_rows}</b>  ·  Models: <b>{len(model_stats)}</b>",
            styles["meta"],
        )
    )
    flowables.append(Spacer(1, 10))

    short_label_map = {
        item.get("model", "-"): f"M{idx + 1}"
        for idx, item in enumerate(model_stats)
    }

    table_data = [[
        "Model", "Runs", "Scored", "Final Avg", "Composite Avg", "Semantic Avg", "ROUGE-L Avg"
    ]]
    for item in model_stats:
        table_data.append([
            Paragraph(_soft_wrap_model_name(str(item.get("model", "-"))), styles["body"]),
            str(item.get("runs", 0)),
            str(item.get("scored", 0)),
            _fmt_metric(item.get("final_avg")),
            _fmt_metric(item.get("composite_avg")),
            _fmt_metric(item.get("semantic_avg")),
            _fmt_metric(item.get("rouge_avg")),
        ])

    col_widths = [188, 36, 40, 58, 64, 64, 58]
    table = Table(table_data, repeatRows=1, colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GT_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.HexColor("#F3F4F6")]),
        ("GRID", (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flowables.append(table)
    flowables.append(Spacer(1, 12))

    flowables.append(Paragraph("Metric Charts (Averages by Model)", styles["h2"]))
    chart_specs = [
        ("final_avg", "Final Score", colors.HexColor("#1D4ED8")),
        ("composite_avg", "Composite Score", colors.HexColor("#047857")),
        ("semantic_avg", "Semantic Similarity", colors.HexColor("#B45309")),
        ("rouge_avg", "ROUGE-L F1", colors.HexColor("#6D28D9")),
    ]
    for key, label, color in chart_specs:
        chart = _metric_chart(model_stats, key, color, short_label_map)
        if chart is None:
            flowables.append(Paragraph(f"{label}: no scored data", styles["body"]))
            continue
        flowables.append(Paragraph(label, styles["h3"]))
        flowables.append(chart)
        flowables.append(Spacer(1, 8))

    legend_rows = [["Chart Label", "Model"]]
    for item in model_stats:
        model_name = str(item.get("model", "-"))
        legend_rows.append([
            short_label_map.get(model_name, "-"),
            Paragraph(_soft_wrap_model_name(model_name, chunk=26), styles["body"]),
        ])

    flowables.append(Paragraph("Chart Label Legend", styles["h3"]))
    legend = Table(legend_rows, repeatRows=1, colWidths=[68, 422])
    legend.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
        ("TEXTCOLOR", (0, 0), (-1, 0), GT_NAVY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.25, GRAY_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    flowables.append(legend)
    flowables.append(Spacer(1, 8))

    flowables.append(PageBreak())
    flowables.append(Paragraph("Configuration Snapshot", styles["h2"]))
    for item in model_stats:
        flowables.append(Paragraph(str(item.get("model", "-")), styles["h3"]))
        flowables.append(Paragraph(f"Runs: {item.get('runs', 0)} | Scored: {item.get('scored', 0)}", styles["body"]))
        flowables.append(Paragraph(f"Prompt variants: {item.get('variants', '-')}", styles["body"]))
        flowables.append(Paragraph(f"Modes: {item.get('modes', '-')}", styles["body"]))
        flowables.append(Paragraph(f"Temperatures: {item.get('temperatures', '-')}", styles["body"]))
        flowables.append(Spacer(1, 6))

    doc.build(flowables)
    return buf.getvalue()
