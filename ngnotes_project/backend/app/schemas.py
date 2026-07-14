from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, model_validator


class Mode(str, Enum):
    concise = "concise"
    structured = "structured"
    both = "both"


class PromptVariant(str, Enum):
    default = "default"
    risk_focused = "risk_focused"
    action_focused = "action_focused"


class GenerateRequest(BaseModel):
    engineering_note: str
    model: str
    mode: Mode = Mode.both
    prompt_variant: PromptVariant = PromptVariant.default
    system_prompt: Optional[str] = None
    user_prompt_template: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    image_description: Optional[str] = None
    report_template_id: Optional[str] = None
    custom_template_hint: Optional[str] = None
    allow_code_blocks: bool = True

    @model_validator(mode="after")
    def validate_source_content(self) -> "GenerateRequest":
        combined = f"{(self.engineering_note or '').strip()}\n{(self.image_description or '').strip()}".strip()
        if len(combined) < 20:
            raise ValueError("Provide at least 20 characters total across notes, voice transcript, and image context")
        return self


class GenerateResponse(BaseModel):
    model: str
    output: str
    prompt_used: str


class ExportPdfRequest(BaseModel):
    summary: str
    filename: Optional[str] = None
    allow_code_blocks: bool = True


class ReportTemplateItem(BaseModel):
    id: str
    name: str
    filename: str
    preview_excerpt: str


class SaveReportTemplateRequest(BaseModel):
    name: str
    headings: List[str]

    @model_validator(mode="after")
    def validate_headings(self) -> "SaveReportTemplateRequest":
        if not self.name.strip():
            raise ValueError("Template name is required")
        if not [h for h in self.headings if h.strip()]:
            raise ValueError("At least one section heading is required")
        return self


class ReportTemplatesResponse(BaseModel):
    templates: List[ReportTemplateItem]


class ReportTemplatePreviewResponse(BaseModel):
    id: str
    name: str
    filename: str
    preview_text: str
