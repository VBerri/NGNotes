"""
NGNotes: FastAPI Backend for Engineering Notes to Report Conversion
"""

from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from datetime import datetime

from .config import settings
from .schemas import (
    GenerateRequest,
    GenerateResponse,
    EvaluateRequest,
    EvaluateResponse,
    DefaultModelsResponse,
    HealthResponse,
    AnalyzeImageResponse,
    ModelCapability,
    ExportPdfRequest,
)
from .llm_client import LLMClient
from .prompting import PromptRenderer
from .eval import Evaluator
from .runtime_store import RuntimeStore, now_iso
from .file_extract import extract_text_from_upload
from . import vision as vision_router
from .pdf_export import PdfReport, build_summary_pdf, build_eval_stats_pdf

app = FastAPI(
    title="NGNotes API",
    description="Engineering Notes to Report Conversion with Multi-Model Evaluation",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
llm_client = LLMClient()
prompt_renderer = PromptRenderer()
evaluator = Evaluator()
runtime_store = RuntimeStore()

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

@app.get("/api/default-models", response_model=DefaultModelsResponse)
async def get_default_models():
    """Get list of default models, including per-model capability flags."""
    models = await llm_client.list_available_models()
    if not models:
        models = [m.strip() for m in settings.DEFAULT_MODELS.split(",") if m.strip()]

    caps_map = await llm_client.capabilities_for_models(models)
    model_capabilities = {
        name: ModelCapability(
            vision="vision" in caps,
            thinking="thinking" in caps,
            tools="tools" in caps,
            audio="audio" in caps,
        )
        for name, caps in caps_map.items()
    }
    return DefaultModelsResponse(models=models, model_capabilities=model_capabilities)


@app.post("/api/extract-note-file")
async def extract_note_file(file: UploadFile = File(...)):
    """Extract readable text from uploaded note files (pdf/md/doc/docx/json/xml/txt)."""
    try:
        filename, extracted_text = extract_text_from_upload(file)
        return {
            "filename": filename,
            "extracted_text": extracted_text,
            "char_count": len(extracted_text),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")


@app.post("/api/analyze-image", response_model=AnalyzeImageResponse)
async def analyze_image(file: UploadFile = File(...)):
    """Analyze an uploaded image with an auto-selected vision-capable model.

    Heuristic picks Qwen (document/screenshot/diagram) or Gemma (natural photos)
    and runs a 'rich' (caption + OCR) or 'normal' (caption only) pass accordingly.
    The returned description is what the Run-Mode UI shows in the editable
    side panel; the user can edit it before triggering /api/generate.
    """
    mime_type = (file.content_type or "").lower()
    if mime_type not in vision_router.SUPPORTED_IMAGE_MIMES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported image type '{mime_type or 'unknown'}'. "
                f"Supported: {sorted(vision_router.SUPPORTED_IMAGE_MIMES)}"
            ),
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image was empty.")
    if len(image_bytes) > settings.MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Image too large ({len(image_bytes)} bytes). "
                f"Limit is {settings.MAX_IMAGE_BYTES} bytes."
            ),
        )

    available_models = await llm_client.list_available_models()
    if not available_models:
        available_models = [m.strip() for m in settings.DEFAULT_MODELS.split(",") if m.strip()]
    vision_models = await llm_client.vision_capable_models(available_models)

    try:
        route = vision_router.select_vision_route(
            filename=file.filename or "",
            mime_type=mime_type,
            image_bytes=image_bytes,
            document_model_default=settings.VISION_MODEL_DOCUMENT,
            natural_model_default=settings.VISION_MODEL_NATURAL,
            available_vision_models=vision_models,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    system_prompt, user_prompt = vision_router.build_vision_messages(route.richness)
    # Transcode the upload to a PNG/JPEG before sending — Ollama's vision
    # preprocessor 400s on WEBP/GIF/BMP/TIFF.
    safe_bytes, safe_mime = vision_router.normalize_image_for_llm(image_bytes, mime_type)
    data_url = vision_router.to_data_url(safe_bytes, safe_mime)

    try:
        description = await llm_client.generate(
            model=route.model,
            prompt=user_prompt,
            system_prompt=system_prompt,
            params={"temperature": 0.2, "top_p": 0.9, "max_tokens": 900},
            images=[data_url],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision model call failed: {e}")

    return AnalyzeImageResponse(
        vision_model=route.model,
        image_kind=route.image_kind,
        richness=route.richness,
        reason=route.reason,
        description=(description or "").strip(),
        width=route.info.width,
        height=route.info.height,
        mime_type=mime_type,
        filename=file.filename or "image",
    )

@app.post("/api/generate", response_model=GenerateResponse)
async def generate_summary(request: GenerateRequest):
    """Generate summary from engineering notes"""
    try:
        engineering_note = request.engineering_note
        image_description = (request.image_description or "").strip()
        used_image_description = False
        if image_description:
            # Prepend an explicit, model-friendly block so the text model knows
            # this content came from an image (not the engineer's own notes).
            engineering_note = (
                "[Attached image — description produced by a vision model, "
                "possibly edited by the author; treat as supplementary context]\n"
                f"{image_description}\n\n"
                "[Engineering notes]\n"
                f"{request.engineering_note}"
            )
            used_image_description = True

        # Render prompt
        prompt = prompt_renderer.render_prompt(
            engineering_note=engineering_note,
            mode=request.mode,
            prompt_variant=request.prompt_variant,
            user_prompt_template=request.user_prompt_template,
        )

        # Only forward raw images if the selected model is vision-capable.
        forward_images: list[str] = []
        if request.images:
            caps = await llm_client.get_model_capabilities(request.model)
            if "vision" in caps:
                for url in request.images:
                    if not url:
                        continue
                    # Re-encode WEBP/etc. to PNG so Ollama's vision preprocessor accepts it.
                    norm = vision_router.normalize_data_url_for_llm(url)
                    forward_images.append(norm or url)

        # Call LLM
        response = await llm_client.generate(
            model=request.model,
            prompt=prompt,
            system_prompt=request.system_prompt,
            params=request.params,
            images=forward_images or None,
        )

        runtime_store.add_row(
            {
                "stored_at": now_iso(),
                "endpoint": "generate",
                "case_id": "",
                "model": request.model,
                "prompt_variant": request.prompt_variant.value,
                "mode": request.mode.value,
                "temperature": (request.params or {}).get("temperature"),
                "top_p": (request.params or {}).get("top_p"),
                "min_p": (request.params or {}).get("min_p"),
                "top_k": (request.params or {}).get("top_k"),
                "max_tokens": (request.params or {}).get("max_tokens"),
                "repetition_penalty": (request.params or {}).get("repetition_penalty"),
                "rouge_l_f1": None,
                "semantic_similarity": None,
                "composite_score": None,
                "rubric_total_score": None,
                "final_score": None,
                "output_preview": response[:300] if response else "",
                "engineering_note": request.engineering_note,
                "reference_summary": "",
                "system_prompt": request.system_prompt,
                "user_prompt_template": request.user_prompt_template,
            }
        )
        
        return GenerateResponse(
            model=request.model,
            output=response,
            prompt_used=prompt,
            used_images=bool(forward_images),
            used_image_description=used_image_description,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/evaluate", response_model=EvaluateResponse)
async def evaluate_summary(request: EvaluateRequest):
    """Evaluate multiple models with parameter sweeps"""
    try:
        # Run evaluation
        results = await evaluator.evaluate(
            models=request.models,
            prompt_variants=request.prompt_variants,
            temperatures=request.temperatures,
            top_ps=request.top_ps,
            min_ps=request.min_ps,
            top_ks=request.top_ks,
            max_tokens=request.max_tokens,
            repetition_penalties=request.repetition_penalties,
            mode=request.mode,
            system_prompt=request.system_prompt,
            user_prompt_template=request.user_prompt_template,
            rubric=request.rubric,
            dataset=request.dataset
        )

        case_lookup = {c.case_id: c for c in request.dataset}
        rows = []
        for r in results.all_results:
            case = case_lookup.get(r.case_id)
            rows.append(
                {
                    "stored_at": now_iso(),
                    "endpoint": "evaluate",
                    "case_id": r.case_id,
                    "model": r.model,
                    "prompt_variant": r.prompt_variant.value,
                    "mode": request.mode.value,
                    "temperature": r.temperature,
                    "top_p": r.top_p,
                    "min_p": r.min_p,
                    "top_k": r.top_k,
                    "max_tokens": r.max_tokens,
                    "repetition_penalty": r.repetition_penalty,
                    "rouge_l_f1": r.rouge_l_f1,
                    "semantic_similarity": r.semantic_similarity,
                    "composite_score": r.composite_score,
                    "rubric_total_score": r.rubric_total_score,
                    "final_score": r.final_score,
                    "output_preview": r.output_preview,
                    "engineering_note": case.engineering_note if case else "",
                    "reference_summary": case.reference_summary if case else "",
                    "system_prompt": request.system_prompt,
                    "user_prompt_template": request.user_prompt_template,
                }
            )
        runtime_store.add_rows(rows)
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/runtime/stats")
async def runtime_stats():
    """Get count of stored runtime rows."""
    return {"stored_rows": runtime_store.count()}


@app.post("/api/runtime/clear")
async def runtime_clear():
    """Clear all stored runtime rows."""
    deleted = runtime_store.clear()
    return {"status": "ok", "deleted_rows": deleted}


@app.get("/api/runtime/export")
async def runtime_export_excel():
    """Export all stored runtime rows as an Excel file."""
    data = runtime_store.export_excel_bytes()
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"ngnotes_runtime_export_{ts}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )


@app.post("/api/export-eval-report-pdf")
async def export_eval_report_pdf(model: str | None = None):
    """Aggregate stored evaluation stats and return a deterministic PDF with tables/charts."""
    from collections import defaultdict

    rows = runtime_store.list_rows()
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No stored evaluation data. Run an evaluation first.",
        )

    # ── Aggregate per-model stats ──────────────────────────────────────────
    stats: dict = defaultdict(lambda: {
        "runs": 0, "scored": 0,
        "rouge_l": [], "semantic": [], "composite": [], "final": [],
        "variants": set(), "temps": set(), "modes": set(),
    })

    for row in rows:
        m = row.get("model") or "unknown"
        s = stats[m]
        s["runs"] += 1
        s["variants"].add(row.get("prompt_variant") or "default")
        t = row.get("temperature")
        if t is not None:
            s["temps"].add(t)
        s["modes"].add(row.get("mode") or "—")
        for field, key in [
            ("rouge_l", "rouge_l_f1"),
            ("semantic", "semantic_similarity"),
            ("composite", "composite_score"),
            ("final", "final_score"),
        ]:
            v = row.get(key)
            if v is not None:
                s[field].append(float(v))
                if field == "final":
                    s["scored"] += 1

    def _avg(lst):
        return round(sum(lst) / len(lst), 4) if lst else None

    # `model` is accepted for backward compatibility with existing frontend
    # query strings, but this endpoint is intentionally deterministic and does
    # not call the LLM.
    _ = model

    def _max(lst):
        return round(max(lst), 4) if lst else None

    model_stats = []
    for model_name, s in sorted(stats.items()):
        model_stats.append(
            {
                "model": model_name,
                "runs": s["runs"],
                "scored": s["scored"],
                "rouge_avg": _avg(s["rouge_l"]),
                "semantic_avg": _avg(s["semantic"]),
                "composite_avg": _avg(s["composite"]),
                "final_avg": _avg(s["final"]),
                "final_best": _max(s["final"]),
                "variants": ", ".join(sorted(str(v) for v in s["variants"])) or "-",
                "modes": ", ".join(sorted(str(v) for v in s["modes"])) or "-",
                "temperatures": ", ".join(sorted(str(t) for t in s["temps"])) or "-",
            }
        )

    try:
        pdf_bytes = build_eval_stats_pdf(total_rows=len(rows), model_stats=model_stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"ngnotes_eval_report_{ts}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/export-pdf")
async def export_pdf(request: ExportPdfRequest):
    """Render a generated summary as a formatted PDF report."""
    summary = (request.summary or "").strip()
    if not summary:
        raise HTTPException(status_code=400, detail="summary must not be empty")

    report = PdfReport(
        summary=summary,
        model=request.model or "unknown-model",
        mode=request.mode,
        prompt_variant=request.prompt_variant,
        engineering_note=request.engineering_note,
        image_description=request.image_description,
        generated_at=datetime.utcnow(),
    )
    try:
        pdf_bytes = build_summary_pdf(report)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    base = (request.filename or "ngnotes_summary").strip() or "ngnotes_summary"
    # Sanitize so the Content-Disposition header is safe.
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in base)[:80] or "ngnotes_summary"
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{safe}_{ts}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )