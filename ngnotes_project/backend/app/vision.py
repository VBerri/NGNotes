"""
NGNotes: Vision routing helpers.

Decides which vision-capable model (Qwen vs Gemma by default) and which analysis
"richness" (normal caption vs caption+OCR) to use for an uploaded image, based
on simple file-side signals (filename hints, MIME, dimensions, aspect ratio).
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from io import BytesIO
from typing import Iterable, Optional, Tuple

try:
    from PIL import Image  # type: ignore
    _PIL_AVAILABLE = True
except Exception:  # pragma: no cover - Pillow is in deps but stay defensive
    _PIL_AVAILABLE = False


SUPPORTED_IMAGE_MIMES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
}

DOCUMENT_FILENAME_HINTS = (
    "screenshot", "screen-shot", "screen_shot", "screen shot",
    "scan", "scanned", "document", "page", "doc-", "doc_",
    "diagram", "schematic", "blueprint", "flowchart",
    "table", "chart", "graph", "plot",
    "ui-", "ui_", "wireframe", "mockup",
)


@dataclass
class ImageInfo:
    width: Optional[int]
    height: Optional[int]
    image_format: Optional[str]  # PIL format string (PNG, JPEG, ...)
    aspect_ratio: Optional[float]


@dataclass
class VisionRoute:
    model: str
    image_kind: str        # "document" | "natural"
    richness: str          # "rich" | "normal"
    reason: str
    info: ImageInfo


def inspect_image(image_bytes: bytes) -> ImageInfo:
    """Pull width/height/format from the image bytes without raising."""
    if not _PIL_AVAILABLE:
        return ImageInfo(None, None, None, None)
    try:
        with Image.open(BytesIO(image_bytes)) as img:
            w, h = img.size
            fmt = img.format
        ratio = (max(w, h) / min(w, h)) if (w and h and min(w, h) > 0) else None
        return ImageInfo(w, h, fmt, ratio)
    except Exception:
        return ImageInfo(None, None, None, None)


def _filename_signals_document(filename: str) -> Optional[str]:
    name = (filename or "").lower()
    for hint in DOCUMENT_FILENAME_HINTS:
        if hint in name:
            return hint
    return None


def classify_image(filename: str, mime_type: str, info: ImageInfo) -> Tuple[str, str]:
    """
    Return (image_kind, reason). image_kind is "document" or "natural".

    Heuristic (cheap, file-side only):
      1. Filename contains a document-ish keyword -> document.
      2. PNG with large dimensions (>=1024 on either side) -> document
         (screenshots are almost always PNG and either tall or wide).
      3. Extreme aspect ratio (>=2.0) -> document (scrolling captures, charts).
      4. Otherwise natural (typical photos: JPEG/WEBP, roughly square-ish).
    """
    hit = _filename_signals_document(filename)
    if hit:
        return "document", f"filename contains '{hit}'"

    fmt = (info.image_format or "").upper()
    mime = (mime_type or "").lower()
    if (fmt == "PNG" or mime == "image/png") and info.width and info.height:
        if max(info.width, info.height) >= 1024:
            return "document", (
                f"PNG at {info.width}x{info.height} is likely a screenshot/diagram"
            )

    if info.aspect_ratio is not None and info.aspect_ratio >= 2.0:
        return "document", f"aspect ratio {info.aspect_ratio:.2f}:1 suggests document/chart"

    return "natural", "no document-style signals detected (treating as a natural image)"


def select_vision_route(
    filename: str,
    mime_type: str,
    image_bytes: bytes,
    *,
    document_model_default: str,
    natural_model_default: str,
    available_vision_models: Iterable[str],
) -> VisionRoute:
    """Pick a vision model + analysis richness for the given image."""
    info = inspect_image(image_bytes)
    image_kind, why = classify_image(filename, mime_type, info)

    preferred = document_model_default if image_kind == "document" else natural_model_default
    secondary = natural_model_default if image_kind == "document" else document_model_default
    available = list(available_vision_models)

    if preferred in available:
        model = preferred
        reason = f"{why}; routed to {model}"
    elif secondary in available:
        model = secondary
        reason = (
            f"{why}; preferred '{preferred}' unavailable, "
            f"falling back to '{secondary}'"
        )
    elif available:
        model = available[0]
        reason = (
            f"{why}; configured vision models unavailable, "
            f"using first available '{model}'"
        )
    else:
        raise RuntimeError(
            "No vision-capable model is available on the runtime. "
            "Pull at least one of: gemma3, qwen2.5-vl, llama3.2-vision."
        )

    richness = "rich" if image_kind == "document" else "normal"
    return VisionRoute(
        model=model,
        image_kind=image_kind,
        richness=richness,
        reason=reason,
        info=info,
    )


def build_vision_messages(richness: str) -> Tuple[str, str]:
    """Return (system_prompt, user_prompt) for the vision model call."""
    system = (
        "You are a meticulous visual analyst supporting engineering documentation. "
        "Describe what is shown in the image accurately and concisely. Do not invent "
        "details that are not visible. If text is shown, transcribe it verbatim."
    )

    if richness == "rich":
        user = (
            "Produce a structured analysis of this image with two clearly labelled sections:\n\n"
            "## Caption\n"
            "A short, technical description of what the image depicts (subject, layout, "
            "any diagrams or UI elements, and notable visual relationships).\n\n"
            "## Extracted Text (OCR)\n"
            "Transcribe every readable piece of text in reading order. Preserve line breaks. "
            "If a region is unreadable, write [unreadable]. If there is no text at all, write 'No text detected.'\n\n"
            "Keep the total response under 400 words."
        )
    else:
        user = (
            "Describe this image in 4-8 sentences for an engineering audience. "
            "Cover: the main subject, important visible details, any text that appears, "
            "and anything technically relevant (measurements, components, state indicators). "
            "Do not speculate beyond what is visible."
        )

    return system, user


def to_data_url(image_bytes: bytes, mime_type: str) -> str:
    """Encode raw image bytes as an OpenAI-compatible image_url data URL."""
    mime = (mime_type or "application/octet-stream").lower()
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


# Ollama's vision preprocessor (llama.cpp / mtmd) currently only accepts PNG
# and JPEG. WEBP, GIF, BMP, TIFF etc. trigger a 400 "Failed to load image or
# audio file" -- so we transcode everything else to PNG before forwarding.
LLM_SAFE_IMAGE_MIMES = {"image/png", "image/jpeg"}


def normalize_image_for_llm(image_bytes: bytes, mime_type: str) -> Tuple[bytes, str]:
    """Return (bytes, mime) safe to send to an Ollama vision model.

    PNG/JPEG inputs are returned untouched. Anything else (WEBP, GIF, BMP, TIFF, ...)
    is decoded with Pillow and re-encoded as PNG. If Pillow is unavailable or the
    image can't be decoded, the original bytes are returned and the caller is
    free to let the LLM reject it.
    """
    mime = (mime_type or "").lower()
    if mime in LLM_SAFE_IMAGE_MIMES:
        return image_bytes, mime
    if not _PIL_AVAILABLE:
        return image_bytes, mime or "application/octet-stream"
    try:
        with Image.open(BytesIO(image_bytes)) as img:
            # Convert palettes / alpha-only / etc. to a PNG-friendly mode.
            if img.mode not in ("RGB", "RGBA", "L"):
                img = img.convert("RGBA" if "A" in img.mode else "RGB")
            out = BytesIO()
            img.save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"
    except Exception:
        return image_bytes, mime or "application/octet-stream"


_DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;,]+)(?:;(?P<enc>base64))?,(?P<payload>.*)$", re.IGNORECASE | re.DOTALL)


def parse_data_url(value: str) -> Optional[Tuple[bytes, str]]:
    """Decode a ``data:<mime>;base64,<payload>`` URL into (bytes, mime).

    Returns None when the value isn't a valid data URL we can decode.
    """
    if not value:
        return None
    m = _DATA_URL_RE.match(value.strip())
    if not m:
        return None
    mime = (m.group("mime") or "").lower()
    payload = m.group("payload") or ""
    try:
        if (m.group("enc") or "").lower() == "base64":
            data = base64.b64decode(payload, validate=False)
        else:
            # Percent-encoded (rare for our use); fall back to bytes of the raw text.
            from urllib.parse import unquote_to_bytes
            data = unquote_to_bytes(payload)
    except Exception:
        return None
    return data, mime


def normalize_data_url_for_llm(value: str) -> Optional[str]:
    """Transcode an image data URL into one Ollama can decode, or None on failure."""
    parsed = parse_data_url(value)
    if not parsed:
        return None
    raw, mime = parsed
    norm_bytes, norm_mime = normalize_image_for_llm(raw, mime)
    return to_data_url(norm_bytes, norm_mime)


def looks_like_data_url(value: str) -> bool:
    return bool(value) and bool(_DATA_URL_RE.match(value.strip()))
