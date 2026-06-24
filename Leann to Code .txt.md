# NGNotes: Project Requirements & Specifications

**Version:** 1.0  
**Last Updated:** 2026-06-16  
**Purpose:** Engineering Notes → LLM-Generated Report + Multi-Model Evaluation

---

## 1. Project Overview

NGNotes is a lightweight, production-ready system for converting raw engineering notes into polished summary reports using open-source Large Language Models (LLMs), with comprehensive evaluation and benchmarking capabilities.

### Key Features

- **Report Generation:** Convert raw engineering notes into structured/concise summaries
- **Multi-Model Comparison:** Run the same prompt across multiple open-source models
- **Parameter Sweeps:** Test different decoding strategies (temperature, top_p, top_k, etc.)
- **Metric-Based Evaluation:**
  - ROUGE-L F1 (lexical overlap against ground truth)
  - Semantic similarity (embedding-based cosine)
  - Composite score (weighted blend)
  - Custom rubric scoring (faithfulness, coverage, structure, actionability, conciseness)
- **Dataset Support:** SciTLDR with swapped mapping (target→note, source→reference)
- **UI Dashboard:** Lightweight frontend for model comparison
- **API-First Design:** Fully RESTful backend for programmatic access

---

## 2. Architecture

### High-Level Flow

```
User Input (Engineering Note + Reference)
         ↓
Frontend/API Client
         ↓
FastAPI Backend
         ├─ Prompt Rendering (prompting.py)
         ├─ LLM Client (llm_client.py)
         │   ↓
         │ Ollama / vLLM Server (OpenAI-compatible)
         │   ↓
         │ Model Output (text)
         │
         └─ Evaluation (eval.py)
           ├─ ROUGE-L computation
           ├─ Semantic similarity (embeddings)
           └─ Rubric scoring
         ↓
Results with Metrics
         ↓
Frontend Display / JSON Response
```

### Backend Architecture (FastAPI)

```
backend/
├── app/
│   ├── main.py              # API routes: /generate, /evaluate, /health
│   ├── config.py            # Settings from .env
│   ├── schemas.py           # Pydantic models (request/response)
│   ├── prompting.py         # Prompt template rendering
│   ├── llm_client.py        # OpenAI-compatible LLM calls
│   ├── eval.py              # ROUGE, semantic, rubric scoring
│   ├── dataset_adapters.py  # SciTLDR conversion utilities
│   └── __init__.py
├── scripts/
│   └── prepare_scitldr.py   # Convert SciTLDR JSONL to evaluator format
├── requirements.txt         # Python dependencies
├── .env.example             # Environment template
└── .env                     # Local config (git-ignored)
```

### Frontend Architecture (Static HTML/JS)

```
frontend/
├── index.html               # Main UI
├── app.js                   # Event handlers, API calls
├── styles.css               # Styling
└── (served by Python http.server on port 5500)
```

---

## 3. Tech Stack

### Backend
- **Framework:** FastAPI 0.115.0
- **Server:** Uvicorn 0.30.6
- **HTTP Client:** httpx 0.27.2
- **Data Validation:** Pydantic 2.9.2
- **Environment:** python-dotenv, pydantic-settings
- **Evaluation Metrics:**
  - rouge-score 0.1.2 (ROUGE-L F1)
  - sentence-transformers 3.1.1 (semantic embeddings)
  - scikit-learn 1.5.2 (cosine similarity)
- **Math:** numpy 2.1.1

### Frontend
- **HTML/CSS/JavaScript** (vanilla, no framework)
- **HTTP:** Fetch API

### LLM Runtime
- **Ollama** (recommended for local, OpenAI-compatible API)
- Or vLLM (if you prefer NVIDIA-optimized serving)
- Both compatible via OpenAI `/chat/completions` endpoint

### Embeddings
- **Model:** sentence-transformers/all-MiniLM-L6-v2 (auto-downloaded on first use)
- **License:** Apache 2.0

---

## 4. System Requirements

### Hardware

| Aspect | Minimum | Recommended |
|--------|---------|-------------|
| CPU | 4-core | 8-core |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB | 50 GB |
| GPU | Optional | NVIDIA (for vLLM) |

**Rationale:** Small models (1B-3B) run on CPU; larger models benefit from GPU.

### Software

- **OS:** Windows 10+, macOS 11+, Linux (Ubuntu 20.04+)
- **Python:** 3.10, 3.11, or 3.12
- **Ollama:** Latest (2024+) — [https://ollama.ai](https://ollama.ai)
- **Git:** For cloning

### Network

- Local machine setup: no external internet required (once models are cached)
- API Ports:
  - **Backend:** 8010 (FastAPI)
  - **Frontend:** 5500 (static server)
  - **Ollama:** 11434 (LLM runtime)

---

## 5. Project Structure

```
NGNotes/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app, routes
│   │   ├── config.py            # Settings (BaseSettings)
│   │   ├── schemas.py           # Pydantic models
│   │   ├── prompting.py         # Prompt templates & rendering
│   │   ├── llm_client.py        # Ollama/vLLM HTTP client
│   │   ├── eval.py              # ROUGE, semantic, rubric
│   │   └── dataset_adapters.py  # SciTLDR utils
│   ├── scripts/
│   │   └── prepare_scitldr.py   # Dataset conversion
│   ├── requirements.txt         # Pip deps
│   ├── .env.example             # Template
│   ├── .env                     # Local (git-ignored)
│   └── .gitignore
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── (no build process)
├── data/
│   ├── sample_eval_dataset.json # Example evaluation data
│   └── (SciTLDR JSONL goes here)
├── .venv/                       # Python virtual env
├── README.md                    # Quick start
├── PROJECT_REQUIREMENTS.md      # This file
└── .gitignore
```

---

## 6. Installation & Setup

### Step 1: Clone or Create Project

```powershell
# Option A: Clone (if you have it in a repo)
git clone <repo-url> NGNotes
cd NGNotes

# Option B: Create fresh
mkdir NGNotes
cd NGNotes
```

### Step 2: Install Ollama (or vLLM)

#### Option A: Ollama (Recommended for Beginners)

1. Download from [https://ollama.ai](https://ollama.ai)
2. Install and start service
3. Pull models:
   ```powershell
   ollama pull llama3.2:1b
   ollama pull llama3.2:latest
   ollama pull qwen2.5:1.5b
   ollama pull phi3:mini
   ```
4. Verify:
   ```powershell
   Invoke-RestMethod http://localhost:11434/api/tags
   ```

#### Option B: vLLM (For GPU Acceleration)

```bash
pip install vllm
vllm serve meta-llama/Llama-2-7b-hf --port 8000 --api-key EMPTY
# Then set VLLM_BASE_URL=http://localhost:8000/v1 in .env
```

### Step 3: Backend Setup

```powershell
cd backend

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.\.venv\Scripts\Activate.ps1

# Activate (macOS/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
copy .env.example .env
# Edit .env if needed (defaults point to Ollama)

# Start backend
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

Backend will be available at `http://localhost:8010`

### Step 4: Frontend Setup

```powershell
cd frontend

# Start static server
python -m http.server 5500
```

Frontend will be available at `http://localhost:5500`

### Step 5: Verify Everything Works

```powershell
# Health check
Invoke-RestMethod http://localhost:8010/api/health

# Should return: { "status": "ok" }
```

---

## 7. Configuration

### Environment Variables (.env)

```env
# LLM Runtime Endpoint (OpenAI-compatible API)
VLLM_BASE_URL=http://localhost:11434/v1

# API Key (Ollama doesn't need one, use "EMPTY")
VLLM_API_KEY=EMPTY

# Comma-separated list of models to expose in /api/default-models
DEFAULT_MODELS=llama3.2:1b,llama3.2:latest,qwen2.5:0.5b,qwen2.5:1.5b,qwen2.5:3b,phi3:mini

# Request timeout in seconds
DEFAULT_TIMEOUT_SECONDS=120

# Embedding model for semantic similarity
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

### Customization

| Variable | Purpose | Default | Alternatives |
|----------|---------|---------|--------------|
| `VLLM_BASE_URL` | LLM endpoint | `http://localhost:11434/v1` | `http://localhost:8000/v1` (vLLM) |
| `VLLM_API_KEY` | Auth token | `EMPTY` | Your API key if using external service |
| `DEFAULT_MODELS` | Models list | Ollama small models | Any compatible model names |
| `EMBEDDING_MODEL` | Embeddings | `all-MiniLM-L6-v2` | `all-mpnet-base-v2` (larger, slower) |

---

## 8. API Documentation

### 1. Health Check

```
GET /api/health
```

**Response:**
```json
{ "status": "ok" }
```

---

### 2. Default Models

```
GET /api/default-models
```

**Response:**
```json
{
  "models": ["llama3.2:1b", "llama3.2:latest", "qwen2.5:1.5b", ...]
}
```

---

### 3. Generate (Simple Generation)

```
POST /api/generate
```

**Request Body:**
```json
{
  "engineering_note": "Raw notes text here...",
  "model": "llama3.2:1b",
  "mode": "both",
  "prompt_variant": "default",
  "params": {
    "temperature": 0.3,
    "top_p": 0.95,
    "top_k": 40,
    "max_tokens": 700,
    "repetition_penalty": null
  }
}
```

**Response:**
```json
{
  "model": "llama3.2:1b",
  "output": "**Executive Summary**\n\n...",
  "prompt_used": "You are a senior engineering program lead...\n\nEngineering notes:\nRaw notes text here..."
}
```

**Fields:**
- `engineering_note` (str, required, ≥20 chars): Raw engineering input
- `model` (str, required): Model ID
- `mode` (str, default="both"): Output format — `"concise"`, `"structured"`, or `"both"`
- `prompt_variant` (str, default="default"): Prompt style — `"default"`, `"risk_focused"`, or `"action_focused"`
- `params` (object, optional): Decoding parameters

---

### 4. Evaluate (Generation + Scoring)

```
POST /api/evaluate
```

**Request Body:**
```json
{
  "models": ["llama3.2:1b", "qwen2.5:1.5b"],
  "prompt_variants": ["default", "action_focused"],
  "temperatures": [0.1, 0.3, 0.7],
  "top_ps": [0.9, 0.95],
  "top_ks": [20, 50],
  "max_tokens": [512, 768],
  "repetition_penalties": [1.0, 1.05],
  "mode": "both",
  "rubric": {
    "enabled": true,
    "weights": {
      "faithfulness": 0.35,
      "coverage": 0.2,
      "structure": 0.15,
      "actionability": 0.15,
      "conciseness": 0.15
    }
  },
  "dataset": [
    {
      "case_id": "eng-001",
      "engineering_note": "Raw notes...",
      "reference_summary": "Ground truth summary..."
    }
  ]
}
```

**Response:**
```json
{
  "total_runs": 8,
  "top_results": [
    {
      "case_id": "eng-001",
      "model": "qwen2.5:1.5b",
      "prompt_variant": "action_focused",
      "temperature": 0.3,
      "top_p": 0.95,
      "top_k": 50,
      "max_tokens": 768,
      "repetition_penalty": 1.0,
      "rouge_l_f1": 0.58,
      "semantic_similarity": 0.82,
      "composite_score": 0.72,
      "rubric_scores": {
        "faithfulness": 0.72,
        "coverage": 0.65,
        "structure": 0.80,
        "actionability": 0.78,
        "conciseness": 0.68
      },
      "rubric_total_score": 0.73,
      "final_score": 0.73,
      "output_preview": "Executive Summary: ..."
    }
  ],
  "aggregate_by_model": {
    "qwen2.5:1.5b": {
      "mean_final_score": 0.71,
      "runs": 4
    }
  },
  "aggregate_by_model_prompt": {
    "qwen2.5:1.5b::action_focused": {
      "mean_final_score": 0.73,
      "runs": 2
    }
  },
  "all_results": [...]
}
```

**Evaluation Parameters:**
- `models` (list of str): Model IDs to test
- `prompt_variants` (list of str): Variants to try
- `temperatures` (list of float): Temperature values [0.0, 2.0]
- `top_ps` (list of float): Top-p values [0.0, 1.0]
- `top_ks` (list of int or null): Top-k values or null
- `max_tokens` (list of int): Max output length
- `repetition_penalties` (list of float or null): Penalties or null
- `mode` (str): `"concise"`, `"structured"`, or `"both"`
- `rubric` (object): Scoring config (optional)
- `dataset` (list of EvalCase): Test cases with ground truth

**Response Fields:**
- `total_runs` (int): Total parameter combinations tested
- `top_results` (list): Top 10 best-scoring runs
- `aggregate_by_model` (dict): Mean scores per model
- `aggregate_by_model_prompt` (dict): Mean scores per model+variant combo
- `all_results` (list): All runs, sorted by final_score (descending)

---

## 9. Metrics & Scoring

### Metric 1: ROUGE-L F1

**What it measures:** Lexical overlap between candidate and reference.

**Formula:** Standard ROUGE-L F1 (longest common subsequence).

**Range:** [0.0, 1.0]

**Good for:** Detecting missing keywords, factual gaps.

**Limitation:** Doesn't capture semantic meaning.

---

### Metric 2: Semantic Similarity

**What it measures:** Semantic alignment via embeddings.

**Formula:** Cosine distance of sentence embeddings.

**Range:** [-1.0, 1.0] → clipped to [0.0, 1.0]

**Model:** `sentence-transformers/all-MiniLM-L6-v2`

**Good for:** Capturing paraphrase & meaning.

**Limitation:** Computationally more expensive.

---

### Metric 3: Composite Score

**What it measures:** Balanced blend of lexical + semantic.

**Formula:** `0.4 * ROUGE-L + 0.6 * (SEMANTIC + 1.0) / 2.0`, clipped to [0.0, 1.0]

**Rationale:** Weights semantic 60% because paraphrase matters more than exact word match.

---

### Metric 4: Rubric Scores (Optional)

Custom multi-dimensional scoring:

| Dimension | Description | Computation |
|-----------|-------------|-------------|
| **Faithfulness** | Composite score (ROUGE + semantic) | See Composite |
| **Coverage** | Key topic extraction | Token-based coverage of top-20 note tokens |
| **Structure** | Adherence to output format | Section detection |
| **Actionability** | Presence of next steps | Bullet points + action verbs |
| **Conciseness** | Length appropriateness | `exp(-abs(len_ratio - 1.0))` |

**Weights:** Customizable per run (default: faithfulness 0.35, coverage 0.2, structure 0.15, actionability 0.15, conciseness 0.15).

**Final Rubric Score:** Weighted average of dimensions.

---

## 10. Prompting System

### Prompt Template Anatomy

```
[BASE INSTRUCTION]
[VARIANT INSTRUCTION]
[MODE INSTRUCTION]

Engineering notes:
[USER INPUT]
```

### Base Instruction

```
You are a senior engineering program lead. Expand raw engineering notes into a high-quality summary report 
that is factual, concise, and decision-oriented. Do not invent facts.
```

### Mode Instructions

| Mode | Output Format |
|------|---------------|
| `concise` | Executive summary only (1-2 short paragraphs) |
| `structured` | Structured report with: Context, Key Decisions, Risks, Open Questions, Action Items |
| `both` | Both sections combined |

### Prompt Variants

| Variant | Focus |
|---------|-------|
| `default` | Clarity and technical correctness |
| `risk_focused` | Highlight reliability, security, delivery risks |
| `action_focused` | Maximize actionable outcomes and explicit next steps |

### Example Full Prompt

```
You are a senior engineering program lead. Expand raw engineering notes into a high-quality summary report 
that is factual, concise, and decision-oriented. Do not invent facts.
Prioritize clarity and technical correctness.
Return two sections: 1) Executive Summary and 2) Structured Report with Context, Key Decisions, Risks, Open Questions, Action Items.

Engineering notes:
We migrated our notification system from cron to an event-driven queue. Latency dropped from 12 min to 40 seconds.
Two incidents where retry storms caused cascading failures when downstream timed out. Team will add circuit breaker patterns 
and dead-letter queue alerts.
```

### System Prompt

Sent as `system` role in chat:

```
You are an expert technical summarization assistant.
```

---

## 11. Decoding Parameters

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| `temperature` | [0.0, 2.0] | 0.3 | Lower = deterministic; higher = creative |
| `top_p` | [0.0, 1.0] | 0.95 | Nucleus sampling; 1.0 = disabled |
| `top_k` | [1, ∞] or null | 40 | Top-k filtering; null = disabled |
| `max_tokens` | [64, 4096] | 700 | Max output length |
| `repetition_penalty` | [0.5, 2.0] or null | 1.0 | Discourage repetition; null = disabled |

**Recommended Ranges for Report Generation:**
- **Conservative:** temp 0.1–0.3, top_p 0.9, top_k 20–40
- **Balanced:** temp 0.3–0.5, top_p 0.95, top_k 40–50
- **Creative:** temp 0.7–1.0, top_p 0.95, top_k 50+

---

## 12. Frontend Usage

### Dashboard Workflow

1. **Enter Backend URL** (default: `http://localhost:8010`)
2. **Select or add models** (comma-separated)
3. **Paste Engineering Note** (≥20 characters)
4. **Paste Ground Truth Summary** (≥20 characters for scoring)
5. **Select mode** (`both`, `concise`, `structured`)
6. **Select prompt variant** (`default`, `risk_focused`, `action_focused`)
7. **Tune parameters** (temperature, top_p, top_k)
8. **Click "Generate For All Models"** OR **"Evaluate Against Ground Truth"**

### Generate vs Evaluate

| Button | Behavior | Output |
|--------|----------|--------|
| **Generate** | If ground truth is blank: show model outputs only. If ground truth is filled: auto-call evaluate. | Text output ± ROUGE/semantic scores |
| **Evaluate** | Require both engineering note and ground truth. Call `/api/evaluate`. | Always show ROUGE-L, semantic, composite, final scores |

### Results Display

For each model run:
- **Model name** and prompt variant
- **Score chips:** ROUGE-L, Semantic, Composite, Final
- **Output preview** (first 300 chars)

---

## 13. Dataset & Evaluation Formats

### Input Dataset Format (JSONL)

```json
{
  "case_id": "eng-001",
  "engineering_note": "Raw notes text",
  "reference_summary": "Ground truth summary"
}
```

### SciTLDR Swapped Mapping

SciTLDR source data:
```json
{
  "target": ["Summary option 1", "Summary option 2"],
  "source": "Full paper abstract or source"
}
```

**Conversion** (via `prepare_scitldr.py`):
- `target[0]` → `engineering_note` (input to model)
- `source` → `reference_summary` (ground truth)

---

## 14. Example Workflows

### Workflow 1: Quick Model Comparison

```powershell
# 1. Via Frontend
#    - Paste note
#    - Paste reference
#    - Click "Evaluate"
#    - Compare ROUGE/semantic scores

# 2. Via API
$payload = @{
  models = @("llama3.2:1b", "qwen2.5:1.5b")
  prompt_variants = @("default")
  temperatures = @(0.3)
  top_ps = @(0.95)
  top_ks = @(40)
  max_tokens = @(700)
  repetition_penalties = @(1.0)
  mode = "both"
  rubric = @{ enabled = $false }
  dataset = @(@{
    case_id = "test-1"
    engineering_note = "..."
    reference_summary = "..."
  })
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post -Uri http://localhost:8010/api/evaluate `
  -ContentType "application/json" -Body $payload
```

### Workflow 2: Parameter Sweep

```powershell
$payload = @{
  models = @("qwen2.5:1.5b")
  prompt_variants = @("default", "action_focused")
  temperatures = @(0.1, 0.3, 0.5, 0.7)
  top_ps = @(0.9, 0.95)
  top_ks = @(20, 40, 50)
  max_tokens = @(512, 768)
  repetition_penalties = @(1.0)
  mode = "both"
  rubric = @{ enabled = $true }
  dataset = $dataset  # Pre-loaded
} | ConvertTo-Json -Depth 8

$result = Invoke-RestMethod -Method Post -Uri http://localhost:8010/api/evaluate `
  -ContentType "application/json" -Body $payload

# Save results
$result | ConvertTo-Json -Depth 10 | Out-File "eval_results.json"
```

### Workflow 3: Batch Evaluation with SciTLDR

```powershell
# 1. Convert SciTLDR JSONL
cd backend
python scripts\prepare_scitldr.py --input-file ..\data\SciTLDR-A-test.jsonl `
  --output ..\data\scitldr_swapped.json

# 2. Load dataset
$dataset = Get-Content ..\data\scitldr_swapped.json -Raw | ConvertFrom-Json

# 3. Run eval on first 100 records
$payload = @{
  models = @("llama3.2:1b", "qwen2.5:1.5b", "phi3:mini")
  prompt_variants = @("default")
  temperatures = @(0.3)
  top_ps = @(0.95)
  top_ks = @(40)
  max_tokens = @(700)
  repetition_penalties = @(1.0)
  mode = "both"
  rubric = @{ enabled = $true }
  dataset = $dataset[0..99]
} | ConvertTo-Json -Depth 8

$result = Invoke-RestMethod -Method Post -Uri http://localhost:8010/api/evaluate `
  -ContentType "application/json" -Body $payload

$result.aggregate_by_model  # Model-level averages
```

---

## 15. Troubleshooting

### Issue: Backend fails to start

**Error:** `ModuleNotFoundError: No module named 'app'`

**Solution:**
```powershell
cd backend
uvicorn app.main:app --app-dir . --host 0.0.0.0 --port 8010
```

---

### Issue: Ollama not responding

**Error:** `Connection refused http://localhost:11434`

**Solution:**
1. Check Ollama is running: `ollama list`
2. If not running, start: `ollama serve`
3. Verify endpoint: `Invoke-RestMethod http://localhost:11434/api/tags`

---

### Issue: Model not found

**Error:** `Ollama model 'llama3.2:1b' not found`

**Solution:**
```powershell
ollama pull llama3.2:1b
# Wait for completion, then retry API call
```

---

### Issue: Evaluate endpoint hangs

**Cause:** Model generation is slow; evaluate waits by default 120 seconds.

**Solution:**
- Increase timeout: Edit `.env` → `DEFAULT_TIMEOUT_SECONDS=300`
- Or reduce max_tokens in evaluate payload
- Or test with faster model (qwen2.5:0.5b is faster than llama3.2:latest)

---

### Issue: "ROUGE is nan" or "Semantic is null"

**Cause:** Embedding model download failed or embeddings service not available.

**Solution:**
```powershell
# Force re-download embeddings
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
```

---

### Issue: Frontend UI doesn't update after clicking Evaluate

**Cause:** Old JavaScript cached by browser.

**Solution:**
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Or clear browser cache

---

## 16. Performance Optimization

### For Large Datasets

1. **Reduce sweep dimensions:**
   - Test 2 models instead of 4
   - 2–3 temperatures instead of 4–5
   - Smaller max_tokens (512 vs 768)

2. **Use faster models:**
   - `qwen2.5:0.5b` (fastest)
   - `phi3:mini`
   - `llama3.2:1b`

3. **Batch via API vs UI:**
   - UI is single-request only
   - API can accept bulk dataset + sweep grid

### Embedding Cache

`sentence-transformers` caches embeddings after first load (~100MB on disk).

---

## 17. Security Considerations

### API

- No authentication by default (local only)
- For remote deployment: Add API key middleware
- All requests validated via Pydantic

### LLM Calls

- No API key stored in code (uses `.env`)
- Ollama default: no auth needed
- vLLM: set `VLLM_API_KEY` in `.env`

### Data

- No data persistence (in-memory evaluation only)
- Results returned as JSON only
- No database backend

---

## 18. Development & Customization

### Adding a New Metric

**File:** `backend/app/eval.py`

```python
def my_custom_metric(reference: str, candidate: str) -> float:
    # Your logic here
    return score  # [0.0, 1.0]
```

**Then in `main.py`:**
```python
my_score = my_custom_metric(case.reference_summary, output)
# Add to EvalRunResult
```

---

### Modifying Prompt Template

**File:** `backend/app/prompting.py`

```python
variants = {
    "my_variant": "Your custom instruction...",
}
```

Then use `prompt_variant="my_variant"` in requests.

---

### Changing Rubric Weights

**In API request:**
```json
"rubric": {
  "enabled": true,
  "weights": {
    "faithfulness": 0.50,
    "coverage": 0.25,
    "structure": 0.10,
    "actionability": 0.10,
    "conciseness": 0.05
  }
}
```

---

## 19. Deployment

### Local Development (Current Setup)

- Backend: `uvicorn ... --reload`
- Frontend: `python -m http.server 5500`
- Ollama: Running locally

### Docker Deployment (Recommended for Production)

Create `backend/Dockerfile`:
```dockerfile
FROM python:3.12
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/app app/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
```

Build and run:
```bash
docker build -t ngnotes-backend .
docker run -p 8010:8010 -e VLLM_BASE_URL=http://host.docker.internal:11434/v1 ngnotes-backend
```

---

## 20. License & Attribution

- **FastAPI, Uvicorn, Pydantic:** MIT
- **ROUGE-score:** Apache 2.0
- **sentence-transformers:** Apache 2.0
- **scikit-learn:** BSD
- **Ollama:** MIT

---

## 21. References & Further Reading

- [FastAPI Docs](https://fastapi.tiangolo.com)
- [ROUGE Score Paper](https://aclanthology.org/W04-1013/)
- [Sentence-Transformers](https://www.sbert.net/)
- [Ollama](https://ollama.ai)
- [vLLM](https://docs.vllm.ai)

---

## 22. Quick Reference Checklist

- [ ] Python 3.10+ installed
- [ ] Ollama downloaded and running (`ollama serve`)
- [ ] Models pulled (at least 1: `ollama pull llama3.2:1b`)
- [ ] Backend `venv` created and activated
- [ ] `requirements.txt` installed
- [ ] `.env` created from `.env.example`
- [ ] Backend started on port 8010
- [ ] Frontend server started on port 5500
- [ ] Health check passes: `http://localhost:8010/api/health`
- [ ] Frontend loads: `http://localhost:5500`
- [ ] First evaluation run succeeds

---

**End of Project Requirements**
