"""
NGNotes: Evaluation - ROUGE-L, Semantic Similarity, Rubric Scoring
"""

import math
import re
import asyncio
from typing import List, Optional, Dict, Any, Tuple
from collections import Counter

import numpy as np
from rouge_score import rouge_scorer
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from .config import settings
from .schemas import (
    EvalCase, EvalRunResult, EvaluateResponse,
    Mode, PromptVariant, RubricConfig
)
from .llm_client import LLMClient
from .prompting import PromptRenderer


class Evaluator:
    """Handles multi-model evaluation with parameter sweeps and metric scoring."""

    def __init__(self):
        self._embedding_model = None
        self._rouge_scorer = rouge_scorer.RougeScorer(["rougeL"], use_stemmer=True)
        self.llm_client = LLMClient()
        self.prompt_renderer = PromptRenderer()

    @property
    def embedding_model(self) -> SentenceTransformer:
        if self._embedding_model is None:
            self._embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)
        return self._embedding_model

    # ─── Metrics ───────────────────────────────────────────────────────────────

    def compute_rouge_l(self, reference: str, candidate: str) -> float:
        """Compute ROUGE-L F1 between reference and candidate."""
        scores = self._rouge_scorer.score(reference, candidate)
        return float(scores["rougeL"].fmeasure)

    def compute_semantic_similarity(self, reference: str, candidate: str) -> float:
        """Compute cosine similarity of sentence embeddings, clipped to [0, 1]."""
        embeddings = self.embedding_model.encode([reference, candidate])
        sim = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]
        return float(max(0.0, min(1.0, float(sim))))

    def compute_composite(self, rouge_l: float, semantic: float) -> float:
        """
        Composite score = 0.4 * ROUGE-L + 0.6 * (semantic + 1.0) / 2.0
        Clipped to [0.0, 1.0].
        """
        composite = 0.4 * rouge_l + 0.6 * (semantic + 1.0) / 2.0
        return float(max(0.0, min(1.0, composite)))

    def compute_hallucination_score(self, note: str, candidate: str) -> float:
        """
        Groundedness score in [0, 1] — higher is better (less hallucination).
        Measures fraction of candidate content-tokens (len > 4) that appear
        in the source note, serving as a grounding proxy.
        """
        src_tokens = set(re.findall(r"\b\w+\b", note.lower()))
        cand_tokens = [t for t in re.findall(r"\b\w+\b", candidate.lower()) if len(t) > 4]
        if not cand_tokens:
            return 1.0
        grounded = sum(1 for t in cand_tokens if t in src_tokens)
        return float(max(0.0, min(1.0, grounded / len(cand_tokens))))

    def compute_context_adherence(self, note: str, prompt: str, candidate: str) -> float:
        """
        Measures how well the output adheres to the source context.
        Combines: (a) overlap of top-30 source tokens in the output,
        and (b) detection of expected structural sections from the prompt.
        Returns [0, 1].
        """
        note_tokens = [t for t in re.findall(r"\b\w+\b", note.lower()) if len(t) > 3]
        top_src = [t for t, _ in Counter(note_tokens).most_common(30)]
        cand_lower = candidate.lower()
        src_overlap = (sum(1 for t in top_src if t in cand_lower) / len(top_src)) if top_src else 0.0

        instruction_keywords = [
            "executive summary", "context", "key decisions", "risks",
            "open questions", "action items", "background", "summary",
        ]
        detected = sum(1 for kw in instruction_keywords if kw in cand_lower)
        instruction_score = min(1.0, detected / 3.0)

        return float(max(0.0, min(1.0, 0.6 * src_overlap + 0.4 * instruction_score)))

    def compute_domain_fluency(self, candidate: str) -> float:
        """
        Estimates domain-specific fluency for technical engineering writing.
        Signals: technical vocabulary density, logical connectors, absence of hedging.
        Returns [0, 1].
        """
        cand_lower = candidate.lower()

        tech_terms = [
            "architecture", "deploy", "latency", "throughput", "pipeline",
            "api", "integration", "scalab", "redundan", "failover",
            "monitoring", "service", "database", "authentication", "authoriz",
            "kubernetes", "container", "microservice", "endpoint", "schema",
            "performance", "security", "infrastructure", "implementation",
        ]
        tech_hit = sum(1 for t in tech_terms if t in cand_lower)
        tech_score = min(1.0, tech_hit / 5.0)

        connectors = [
            "therefore", "however", "consequently", "as a result",
            "furthermore", "in order to", "based on", "given that",
        ]
        conn_hit = sum(1 for c in connectors if c in cand_lower)
        conn_score = min(1.0, conn_hit / 2.0)

        hedges = ["i think", "maybe", "perhaps", "i believe", "probably", "not sure"]
        hedge_count = sum(1 for h in hedges if h in cand_lower)
        hedge_penalty = min(0.3, hedge_count * 0.1)

        raw = 0.55 * tech_score + 0.30 * conn_score - hedge_penalty + 0.15
        return float(max(0.0, min(1.0, raw)))

    def compute_hallucination_rate(self, note: str, candidate: str) -> float:
        """
        Estimate hallucination rate as the fraction of candidate noun-phrases
        (tokens > 4 chars) that do NOT appear in the source note.
        Returns a score in [0, 1] where 1.0 = no hallucination, 0.0 = fully hallucinated.
        """
        src_tokens = set(re.findall(r"\b\w+\b", note.lower()))
        cand_tokens = [t for t in re.findall(r"\b\w+\b", candidate.lower()) if len(t) > 4]
        if not cand_tokens:
            return 1.0
        grounded = sum(1 for t in cand_tokens if t in src_tokens)
        return float(max(0.0, min(1.0, grounded / len(cand_tokens))))

    def compute_context_adherence(self, note: str, prompt: str, candidate: str) -> float:
        """
        Measures how well the output adheres to the source context.
        Combines: (a) instruction keyword coverage from the rendered prompt,
        and (b) overlap of the top-30 source tokens in the output.
        Returns [0, 1].
        """
        # Source token overlap (top-30 content words)
        note_tokens = [t for t in re.findall(r"\b\w+\b", note.lower()) if len(t) > 3]
        top_src = [t for t, _ in Counter(note_tokens).most_common(30)]
        cand_lower = candidate.lower()
        src_overlap = (sum(1 for t in top_src if t in cand_lower) / len(top_src)) if top_src else 0.0

        # Instruction adherence: expected structural directives from prompt
        instruction_keywords = [
            "executive summary", "context", "key decisions", "risks",
            "open questions", "action items", "background", "summary",
        ]
        detected = sum(1 for kw in instruction_keywords if kw in cand_lower)
        instruction_score = min(1.0, detected / 3.0)

        return float(max(0.0, min(1.0, 0.6 * src_overlap + 0.4 * instruction_score)))

    def compute_domain_fluency(self, candidate: str) -> float:
        """
        Estimates domain-specific fluency for technical engineering writing.
        Signals: presence of technical vocabulary, structured section markers,
        logical connectors, and absence of filler/hedging language.
        Returns [0, 1].
        """
        cand_lower = candidate.lower()

        # Technical vocabulary (engineering / software domain)
        tech_terms = [
            "architecture", "deploy", "latency", "throughput", "pipeline",
            "api", "integration", "scalab", "redundan", "failover",
            "monitoring", "service", "database", "authentication", "authoriz",
            "kubernetes", "container", "microservice", "endpoint", "schema",
            "performance", "security", "infrastructure", "implementation",
        ]
        tech_hit = sum(1 for t in tech_terms if t in cand_lower)
        tech_score = min(1.0, tech_hit / 5.0)

        # Logical connectors (signal coherent argumentation)
        connectors = [
            "therefore", "however", "consequently", "as a result",
            "furthermore", "in order to", "based on", "given that",
        ]
        conn_hit = sum(1 for c in connectors if c in cand_lower)
        conn_score = min(1.0, conn_hit / 2.0)

        # Penalise hedging / vague filler
        hedges = ["i think", "maybe", "perhaps", "i believe", "probably", "not sure"]
        hedge_count = sum(1 for h in hedges if h in cand_lower)
        hedge_penalty = min(0.3, hedge_count * 0.1)

        raw = 0.55 * tech_score + 0.30 * conn_score - hedge_penalty + 0.15
        return float(max(0.0, min(1.0, raw)))

    def compute_rubric(
        self,
        note: str,
        reference: str,
        candidate: str,
        rouge_l: float,
        semantic: float,
        weights: Optional[Dict[str, float]] = None,
    ) -> Tuple[Dict[str, float], float]:
        """
        Compute rubric scores across 5 dimensions and return (scores_dict, weighted_total).

        Dimensions:
          - faithfulness : composite(rouge_l, semantic)
          - coverage     : token-based coverage of top-20 note tokens
          - structure    : detection of expected report sections
          - actionability: bullet points + action verbs
          - conciseness  : exp(-abs(len_ratio - 1.0))
        """
        default_weights: Dict[str, float] = {
            "faithfulness": 0.35,
            "coverage": 0.20,
            "structure": 0.15,
            "actionability": 0.15,
            "conciseness": 0.15,
        }
        if weights:
            default_weights.update(weights)

        # Faithfulness
        faithfulness = self.compute_composite(rouge_l, semantic)

        # Coverage: top-20 tokens (len > 3) from the note
        note_tokens = re.findall(r"\b\w+\b", note.lower())
        note_tokens = [t for t in note_tokens if len(t) > 3]
        top_tokens = [t for t, _ in Counter(note_tokens).most_common(20)]
        cand_lower = candidate.lower()
        if top_tokens:
            covered = sum(1 for t in top_tokens if t in cand_lower)
            coverage = covered / len(top_tokens)
        else:
            coverage = 0.0

        # Structure: detect key section headings
        structure_keywords = [
            "executive summary",
            "context",
            "key decisions",
            "risks",
            "open questions",
            "action items",
            "summary",
            "background",
        ]
        detected = sum(1 for kw in structure_keywords if kw in cand_lower)
        structure = min(1.0, detected / 3.0)  # 3+ sections = full score

        # Actionability: bullet patterns + action verbs
        action_verbs = [
            "will", "should", "must", "need", "implement", "deploy",
            "monitor", "review", "update", "fix", "add", "create",
            "define", "ensure", "complete", "investigate", "resolve",
        ]
        bullet_score = 1.0 if re.search(r"[-•*]\s", candidate) else 0.0
        verb_count = sum(1 for v in action_verbs if v in candidate.lower())
        verb_score = min(1.0, verb_count / 3.0)
        actionability = (bullet_score + verb_score) / 2.0

        # Conciseness
        ref_len = max(1, len(reference.split()))
        cand_len = max(1, len(candidate.split()))
        len_ratio = cand_len / ref_len
        conciseness = math.exp(-abs(len_ratio - 1.0))

        scores: Dict[str, float] = {
            "faithfulness": faithfulness,
            "coverage": coverage,
            "structure": structure,
            "actionability": actionability,
            "conciseness": conciseness,
        }

        total = sum(scores[k] * default_weights[k] for k in scores)
        return scores, float(total)

    # ─── Evaluate ──────────────────────────────────────────────────────────────

    async def evaluate(
        self,
        models: List[str],
        prompt_variants: List[PromptVariant],
        temperatures: List[float],
        top_ps: List[float],
        min_ps: List[Optional[float]],
        top_ks: List[Optional[int]],
        max_tokens: List[int],
        repetition_penalties: List[Optional[float]],
        mode: Mode,
        system_prompt: Optional[str],
        user_prompt_template: Optional[str],
        rubric: RubricConfig,
        dataset: List[EvalCase],
    ) -> EvaluateResponse:
        """Run the full evaluation grid and return aggregated results."""
        all_results: List[EvalRunResult] = []

        for case in dataset:
            for model in models:
                for variant in prompt_variants:
                    for temp in temperatures:
                        for top_p in top_ps:
                            for min_p in min_ps:
                                for top_k in top_ks:
                                    for max_tok in max_tokens:
                                        for rep_penalty in repetition_penalties:
                                            result = await self._run_single(
                                                case=case,
                                                model=model,
                                                variant=variant,
                                                temperature=temp,
                                                top_p=top_p,
                                                min_p=min_p,
                                                top_k=top_k,
                                                max_tokens=max_tok,
                                                repetition_penalty=rep_penalty,
                                                mode=mode,
                                                system_prompt=system_prompt,
                                                user_prompt_template=user_prompt_template,
                                                rubric=rubric,
                                            )
                                            all_results.append(result)

        # Sort by final_score descending; unscored/error runs go last (unchanged)
        all_results.sort(
            key=lambda r: r.final_score if r.final_score is not None else -1.0,
            reverse=True,
        )

        top_results = all_results[:10]

        # Aggregate by model; do not coerce missing scores to 0.
        aggregate_by_model: Dict[str, Dict[str, Any]] = {}
        model_names = {r.model for r in all_results}
        for model in model_names:
            model_runs = [r for r in all_results if r.model == model]
            scored = [r.final_score for r in model_runs if r.final_score is not None]
            aggregate_by_model[model] = {
                "mean_final_score": float(np.mean(scored)) if scored else None,
                "runs": len(model_runs),
                "scored_runs": len(scored),
            }

        # Aggregate by model + prompt_variant; preserve None when unscored.
        aggregate_by_model_prompt: Dict[str, Dict[str, Any]] = {}
        mp_buckets: Dict[str, List[Optional[float]]] = {}
        mp_runs: Dict[str, int] = {}
        for r in all_results:
            key = f"{r.model}::{r.prompt_variant.value}"
            mp_runs[key] = mp_runs.get(key, 0) + 1
            mp_buckets.setdefault(key, []).append(r.final_score)

        for key, vals in mp_buckets.items():
            scored = [v for v in vals if v is not None]
            aggregate_by_model_prompt[key] = {
                "mean_final_score": float(np.mean(scored)) if scored else None,
                "runs": mp_runs.get(key, len(vals)),
                "scored_runs": len(scored),
            }

        return EvaluateResponse(
            total_runs=len(all_results),
            top_results=top_results,
            aggregate_by_model=aggregate_by_model,
            aggregate_by_model_prompt=aggregate_by_model_prompt,
            all_results=all_results,
        )

    async def _run_single(
        self,
        case: EvalCase,
        model: str,
        variant: PromptVariant,
        temperature: float,
        top_p: float,
        min_p: Optional[float],
        top_k: Optional[int],
        max_tokens: int,
        repetition_penalty: Optional[float],
        mode: Mode,
        system_prompt: Optional[str],
        user_prompt_template: Optional[str],
        rubric: RubricConfig,
    ) -> EvalRunResult:
        """Run a single (model, params, case) combination and score the output."""
        params: Dict[str, Any] = {
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
        }
        if min_p is not None:
            params["min_p"] = min_p
        if top_k is not None:
            params["top_k"] = top_k
        if repetition_penalty is not None:
            params["repetition_penalty"] = repetition_penalty

        prompt = self.prompt_renderer.render_prompt(
            engineering_note=case.engineering_note,
            mode=mode,
            prompt_variant=variant,
            user_prompt_template=user_prompt_template,
        )

        try:
            output = await self.llm_client.generate(
                model=model,
                prompt=prompt,
                system_prompt=system_prompt,
                params=params,
            )
        except Exception as e:
            output = f"[ERROR: {str(e)}]"

        rouge_l: Optional[float] = None
        semantic: Optional[float] = None
        composite: Optional[float] = None
        rubric_scores: Optional[Dict[str, float]] = None
        rubric_total: Optional[float] = None
        hallucination_score: Optional[float] = None
        context_adherence: Optional[float] = None
        domain_fluency: Optional[float] = None
        final_score: Optional[float] = None

        if output and not output.startswith("[ERROR"):
            try:
                rouge_l = self.compute_rouge_l(case.reference_summary, output)
                semantic = self.compute_semantic_similarity(
                    case.reference_summary, output
                )
                composite = self.compute_composite(rouge_l, semantic)

                hallucination_score = self.compute_hallucination_score(
                    case.engineering_note, output
                )
                context_adherence = self.compute_context_adherence(
                    case.engineering_note, prompt, output
                )
                domain_fluency = self.compute_domain_fluency(output)

                if rubric.enabled:
                    rubric_scores, rubric_total = self.compute_rubric(
                        note=case.engineering_note,
                        reference=case.reference_summary,
                        candidate=output,
                        rouge_l=rouge_l,
                        semantic=semantic,
                        weights=rubric.weights,
                    )
                    # Blend rubric with the three precision metrics.
                    # Weights: rubric 55%, hallucination 20%, adherence 15%, fluency 10%
                    final_score = float(
                        0.55 * rubric_total
                        + 0.20 * hallucination_score
                        + 0.15 * context_adherence
                        + 0.10 * domain_fluency
                    )
                else:
                    # Without rubric: composite 55%, hallucination 20%, adherence 15%, fluency 10%
                    final_score = float(
                        0.55 * composite
                        + 0.20 * hallucination_score
                        + 0.15 * context_adherence
                        + 0.10 * domain_fluency
                    )
            except Exception:
                pass

        # Only show preview for successful outputs, not raw error strings
        is_error = not output or output.startswith("[ERROR")
        preview = "" if is_error else output[:300]

        return EvalRunResult(
            case_id=case.case_id,
            model=model,
            prompt_variant=variant,
            temperature=temperature,
            top_p=top_p,
            min_p=min_p,
            top_k=top_k,
            max_tokens=max_tokens,
            repetition_penalty=repetition_penalty,
            rouge_l_f1=rouge_l,
            semantic_similarity=semantic,
            composite_score=composite,
            rubric_scores=rubric_scores,
            rubric_total_score=rubric_total,
            hallucination_score=hallucination_score,
            context_adherence=context_adherence,
            domain_fluency=domain_fluency,
            final_score=final_score,
            output_preview=preview,
        )
