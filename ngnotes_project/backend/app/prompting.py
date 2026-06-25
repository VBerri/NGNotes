"""
NGNotes: Prompt template rendering
"""

from typing import Optional
from .schemas import Mode, PromptVariant

class PromptRenderer:
    """Handles prompt template rendering for different modes and variants"""
    
    def __init__(self):
        self.default_system_prompt = "You are an expert note-to-report assistant."

        # Base instruction for all prompts
        self.base_instruction = (
            "You are a senior reporting lead. Expand raw notes into a high-quality report "
            "that is factual, concise, and decision-oriented. Do not invent facts."
        )
        
        # Mode instructions
        self.mode_instructions = {
            Mode.concise: "Return only an executive summary (1-2 short paragraphs).",
            Mode.structured: (
                "Return a structured report with the following sections: "
                "1) Context, 2) Key Decisions, 3) Risks, 4) Open Questions, 5) Action Items."
            ),
            Mode.both: (
                "Return two sections: 1) Executive Summary and 2) Structured Report with Context, "
                "Key Decisions, Risks, Open Questions, Action Items."
            )
        }
        
        # Prompt variants
        self.variants = {
            PromptVariant.default: "Prioritize clarity and technical correctness.",
            PromptVariant.risk_focused: (
                "Highlight reliability, security, delivery risks, and potential failure points."
            ),
            PromptVariant.action_focused: (
                "Maximize actionable outcomes and explicit next steps. "
                "Use bullet points and clear action verbs."
            )
        }
    
    def render_prompt(
        self,
        engineering_note: str,
        mode: Mode = Mode.both,
        prompt_variant: PromptVariant = PromptVariant.default,
        user_prompt_template: Optional[str] = None,
    ) -> str:
        """Render a complete prompt for the LLM"""

        if user_prompt_template and user_prompt_template.strip():
            template = user_prompt_template.strip()
            if "{engineering_note}" in template:
                return template.replace("{engineering_note}", engineering_note)
            return f"{template}\n\nSource notes:\n{engineering_note}"
        
        # Build the prompt
        prompt_parts = [
            self.base_instruction,
            self.variants[prompt_variant],
            self.mode_instructions[mode],
            "",
            "Source notes:",
            engineering_note
        ]
        
        return "\n".join(prompt_parts)