"""
NGNotes: Pydantic models for API requests and responses
"""

from pydantic import BaseModel, ConfigDict, field_validator
from typing import List, Optional, Dict, Any
from enum import Enum

class Mode(str, Enum):
    concise = "concise"
    structured = "structured"
    both = "both"

class PromptVariant(str, Enum):
    default = "default"
    risk_focused = "risk_focused"
    action_focused = "action_focused"

class RubricConfig(BaseModel):
    enabled: bool = True
    weights: Optional[Dict[str, float]] = None

class EvalCase(BaseModel):
    case_id: str
    engineering_note: str
    reference_summary: str

    @field_validator("engineering_note", "reference_summary")
    @classmethod
    def must_be_20_chars(cls, v: str, info) -> str:
        if len(v.strip()) < 20:
            raise ValueError(f"{info.field_name} must be at least 20 characters")
        return v

class GenerateRequest(BaseModel):
    engineering_note: str
    model: str
    mode: Mode = Mode.both
    prompt_variant: PromptVariant = PromptVariant.default
    system_prompt: Optional[str] = None
    user_prompt_template: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    # Optional editable description produced by /api/analyze-image; injected into the prompt
    # when the selected text model can't see images natively.
    image_description: Optional[str] = None
    # Optional inline images as data URLs ("data:image/png;base64,..."). Forwarded directly
    # only when the selected model is vision-capable; otherwise ignored.
    images: Optional[List[str]] = None

    @field_validator("engineering_note")
    @classmethod
    def note_must_be_20_chars(cls, v: str) -> str:
        if len(v.strip()) < 20:
            raise ValueError("engineering_note must be at least 20 characters")
        return v

class GenerateResponse(BaseModel):
    model: str
    output: str
    prompt_used: str
    used_images: bool = False
    used_image_description: bool = False


class AnalyzeImageResponse(BaseModel):
    vision_model: str
    image_kind: str            # "document" | "natural"
    richness: str              # "rich" | "normal"
    reason: str
    description: str
    width: Optional[int] = None
    height: Optional[int] = None
    mime_type: str
    filename: str


class ModelCapability(BaseModel):
    vision: bool = False
    thinking: bool = False
    tools: bool = False
    audio: bool = False


class ExportPdfRequest(BaseModel):
    """Payload for /api/export-pdf — everything needed to render the report."""
    summary: str
    model: str
    mode: Optional[str] = None
    prompt_variant: Optional[str] = None
    engineering_note: Optional[str] = None
    image_description: Optional[str] = None
    filename: Optional[str] = None  # client-suggested file name (without .pdf)

class EvaluateRequest(BaseModel):
    models: List[str]
    prompt_variants: List[PromptVariant]
    temperatures: List[float]
    top_ps: List[float]
    min_ps: List[Optional[float]]
    top_ks: List[Optional[int]]
    max_tokens: List[int]
    repetition_penalties: List[Optional[float]]
    mode: Mode = Mode.both
    system_prompt: Optional[str] = None
    user_prompt_template: Optional[str] = None
    rubric: RubricConfig = RubricConfig()
    dataset: List[EvalCase]

class ModelInfo(BaseModel):
    name: str

class DefaultModelsResponse(BaseModel):
    # Pydantic v2 reserves the ``model_`` prefix; opt out for this response model
    # so ``model_capabilities`` doesn't trigger a warning.
    model_config = ConfigDict(protected_namespaces=())

    models: List[str]
    # Optional capability map (name -> capability flags). Frontend uses this to
    # decide whether to route an attached image through a vision-proxy step or
    # let the selected model handle it natively.
    model_capabilities: Optional[Dict[str, "ModelCapability"]] = None

class HealthResponse(BaseModel):
    status: str

class EvalRunResult(BaseModel):
    case_id: str
    model: str
    prompt_variant: PromptVariant
    temperature: float
    top_p: float
    min_p: Optional[float]
    top_k: Optional[int]
    max_tokens: int
    repetition_penalty: Optional[float]
    rouge_l_f1: Optional[float]
    semantic_similarity: Optional[float]
    composite_score: Optional[float]
    rubric_scores: Optional[Dict[str, float]]
    rubric_total_score: Optional[float]
    final_score: Optional[float]
    output_preview: str

class EvaluateResponse(BaseModel):
    total_runs: int
    top_results: List[EvalRunResult]
    aggregate_by_model: Dict[str, Dict[str, Any]]
    aggregate_by_model_prompt: Dict[str, Dict[str, Any]]
    all_results: List[EvalRunResult]