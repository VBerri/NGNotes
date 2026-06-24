/**
 * NGNotes – Frontend Application
 * Two UI modes:
 *  1) Evaluation Mode (multi-model compare/evaluate + settings)
 *  2) Run Mode (single-model summarize: input -> output)
 */

// ─── DOM References ───────────────────────────────────────────────────────────
const tabEvaluation = document.getElementById("tab-evaluation");
const tabRun = document.getElementById("tab-run");
const evaluationScreen = document.getElementById("evaluation-screen");
const runScreen = document.getElementById("run-screen");

const backendUrlInput = document.getElementById("backend-url");
const modelsInput = document.getElementById("models");

const systemPromptInput = document.getElementById("system-prompt");
const userPromptTemplateInput = document.getElementById("user-prompt-template");

const noteInput = document.getElementById("engineering-note");
const evalNoteFileInput = document.getElementById("eval-note-file");
const uploadEvalNoteBtn = document.getElementById("upload-eval-note-btn");
const evalUploadStatus = document.getElementById("eval-upload-status");
const evalVoiceBtn = document.getElementById("eval-voice-btn");
const evalVoiceStatus = document.getElementById("eval-voice-status");
const referenceInput = document.getElementById("reference-summary");
const modeSelect = document.getElementById("mode");
const variantSelect = document.getElementById("prompt-variant");
const tempInput = document.getElementById("temperature");
const topPInput = document.getElementById("top-p");
const topKInput = document.getElementById("top-k");

const runModelSelect = document.getElementById("run-model");
const runTempInput = document.getElementById("run-temperature");
const runTopPInput = document.getElementById("run-top-p");
const runTopKInput = document.getElementById("run-top-k");
const syncRunDefaultsBtn = document.getElementById("sync-run-defaults");

const generateBtn = document.getElementById("generate-btn");
const evaluateBtn = document.getElementById("evaluate-btn");
const resultsContainer = document.getElementById("results-container");
const runtimeStats = document.getElementById("runtime-stats");
const refreshRuntimeBtn = document.getElementById("refresh-runtime-btn");
const exportRuntimeBtn = document.getElementById("export-runtime-btn");
const clearRuntimeBtn = document.getElementById("clear-runtime-btn");

const runInput = document.getElementById("run-input");
const runFileInput = document.getElementById("run-file");
const uploadRunFileBtn = document.getElementById("upload-run-file-btn");
const clearRunFileBtn = document.getElementById("clear-run-file-btn");
const runUploadStatus = document.getElementById("run-upload-status");
const runVoiceBtn = document.getElementById("run-voice-btn");
const runVoiceStatus = document.getElementById("run-voice-status");
const runOutput = document.getElementById("run-output");
const runSummarizeBtn = document.getElementById("run-summarize-btn");
const runDownloadPdfBtn = document.getElementById("run-download-pdf-btn");
const runStatus = document.getElementById("run-status");
const runMeta = document.getElementById("run-meta");

// Snapshot of the last successful Run-Mode generation, used by the PDF export.
let lastRunReport = null;

// ─── Image / vision panel ─────────────────────────────────────────────────────
const visionPanel = document.getElementById("vision-panel");
const visionThumb = document.getElementById("vision-thumb");
const visionFilenameEl = document.getElementById("vision-filename");
const visionModelEl = document.getElementById("vision-model");
const visionKindEl = document.getElementById("vision-kind");
const visionRichnessEl = document.getElementById("vision-richness");
const visionReasonEl = document.getElementById("vision-reason");
const visionPassthroughNote = document.getElementById("vision-passthrough-note");
const visionDescriptionEl = document.getElementById("vision-description");
const reanalyzeImageBtn = document.getElementById("reanalyze-image-btn");

// In-memory state for the currently-attached image (only one at a time)
const imageState = {
  file: null,            // File object
  dataUrl: null,         // base64 data URL (for vision-capable models)
  analysis: null,        // last AnalyzeImageResponse from backend
};

// Per-model capability cache populated from /api/default-models
let modelCapabilities = {}; // { "qwen3.6:latest": {vision: true, ...}, ... }

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRecognition = null;
let activeVoiceTarget = null;
let activeVoiceButton = null;
let activeVoiceStatus = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiBase() {
  return (backendUrlInput.value || "http://localhost:8010").replace(/\/$/, "");
}

function getModels() {
  return modelsInput.value
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseNumber(value, fallback) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntOrNull(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function getPromptSettings() {
  return {
    system_prompt: systemPromptInput.value.trim() || null,
    user_prompt_template: userPromptTemplateInput.value.trim() || null,
  };
}

function setEvalLoading(isLoading) {
  generateBtn.disabled = isLoading;
  evaluateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? "Working..." : "Generate For All Models";
  evaluateBtn.textContent = isLoading ? "Working..." : "Evaluate Against Ground Truth";
}

function setRunLoading(isLoading) {
  runSummarizeBtn.disabled = isLoading;
  runSummarizeBtn.textContent = isLoading ? "Summarizing..." : "Summarize";
}

function showEvalError(message) {
  resultsContainer.innerHTML = `<div class="error-box"><strong>Error:</strong> ${escapeHtml(message)}</div>`;
}

function setRunStatus(message, isError = false) {
  runStatus.textContent = message;
  runStatus.classList.toggle("error-text", isError);
}

function setUploadStatus(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle("error-text", isError);
}

function appendTranscript(targetTextarea, text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return;

  const current = targetTextarea.value || "";
  const needsSpace = current.length > 0 && !current.endsWith("\n") && !current.endsWith(" ");
  targetTextarea.value = `${current}${needsSpace ? " " : ""}${cleaned}`;
}

function resetVoiceUi() {
  if (activeVoiceButton) {
    activeVoiceButton.textContent = "Start Voice Input";
    activeVoiceButton.classList.remove("btn-listening");
  }
  if (activeVoiceStatus && activeVoiceStatus.textContent.includes("Listening")) {
    setUploadStatus(activeVoiceStatus, "Voice input stopped.");
  }
}

function stopActiveVoiceRecognition() {
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch (_) {
      // Ignore stop errors from already-stopped recognizers.
    }
  }
}

function startVoiceInput(targetTextarea, statusEl, buttonEl) {
  if (!SpeechRecognition) {
    setUploadStatus(statusEl, "Voice input is not supported in this browser.", true);
    return;
  }

  // Toggle stop when clicking same active button.
  if (activeRecognition && activeVoiceButton === buttonEl) {
    stopActiveVoiceRecognition();
    return;
  }

  // Stop any other active recognizer before starting a new one.
  if (activeRecognition) {
    stopActiveVoiceRecognition();
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  activeRecognition = recognition;
  activeVoiceTarget = targetTextarea;
  activeVoiceButton = buttonEl;
  activeVoiceStatus = statusEl;

  buttonEl.textContent = "Stop Voice Input";
  buttonEl.classList.add("btn-listening");
  setUploadStatus(statusEl, "Listening... Speak now.");

  recognition.onresult = (event) => {
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const segment = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) {
        appendTranscript(activeVoiceTarget, segment);
      } else {
        interimText += segment;
      }
    }

    if (interimText.trim()) {
      setUploadStatus(statusEl, `Listening... ${interimText.trim()}`);
    }
  };

  recognition.onerror = (event) => {
    setUploadStatus(statusEl, `Voice input error: ${event.error}`, true);
  };

  recognition.onend = () => {
    resetVoiceUi();
    activeRecognition = null;
    activeVoiceTarget = null;
    activeVoiceButton = null;
    activeVoiceStatus = null;
  };

  try {
    recognition.start();
  } catch (e) {
    setUploadStatus(statusEl, `Could not start voice input: ${e.message}`, true);
    resetVoiceUi();
    activeRecognition = null;
    activeVoiceTarget = null;
    activeVoiceButton = null;
    activeVoiceStatus = null;
  }
}

async function refreshRuntimeStats() {
  try {
    const res = await fetch(`${apiBase()}/api/runtime/stats`);
    if (!res.ok) return;
    const data = await res.json();
    runtimeStats.textContent = `Stored rows: ${data.stored_rows ?? 0}`;
  } catch (_) {
    runtimeStats.textContent = "Stored rows: unavailable";
  }
}

async function exportRuntimeExcel() {
  try {
    exportRuntimeBtn.disabled = true;
    exportRuntimeBtn.textContent = "Exporting...";

    const res = await fetch(`${apiBase()}/api/runtime/export`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Export failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dispo = res.headers.get("Content-Disposition") || "";
    const match = dispo.match(/filename=([^;]+)/i);
    const fallback = `ngnotes_runtime_export_${Date.now()}.xlsx`;
    const filename = (match ? match[1] : fallback).replace(/"/g, "");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    showEvalError(`Failed to export Excel: ${e.message}`);
  } finally {
    exportRuntimeBtn.disabled = false;
    exportRuntimeBtn.textContent = "Export To Excel";
  }
}

async function clearRuntimeData() {
  try {
    clearRuntimeBtn.disabled = true;
    clearRuntimeBtn.textContent = "Clearing...";
    const res = await fetch(`${apiBase()}/api/runtime/clear`, { method: "POST" });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Clear failed");
    }
    await refreshRuntimeStats();
    setRunStatus("Stored runtime data cleared.");
  } catch (e) {
    showEvalError(`Failed to clear runtime data: ${e.message}`);
  } finally {
    clearRuntimeBtn.disabled = false;
    clearRuntimeBtn.textContent = "Clear Stored Data";
  }
}

async function uploadNoteFile(fileInput, targetTextarea, statusEl, buttonEl) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    setUploadStatus(statusEl, "Select a file first.", true);
    return;
  }

  const form = new FormData();
  form.append("file", file);

  try {
    buttonEl.disabled = true;
    const oldText = buttonEl.textContent;
    buttonEl.dataset.originalText = oldText;
    buttonEl.textContent = "Uploading...";
    setUploadStatus(statusEl, "Extracting text from file...");

    const res = await fetch(`${apiBase()}/api/extract-note-file`, {
      method: "POST",
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || res.statusText || "Upload failed");
    }

    targetTextarea.value = data.extracted_text || "";
    setUploadStatus(
      statusEl,
      `Loaded ${data.filename} (${data.char_count || 0} chars) into notes.`
    );
  } catch (e) {
    setUploadStatus(statusEl, `Failed: ${e.message}`, true);
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = buttonEl.dataset.originalText || "Upload Note File";
  }
}

function updateRunMeta() {
  const model = runModelSelect.value || "-";
  const t = runTempInput.value || "-";
  const p = runTopPInput.value || "-";
  const k = runTopKInput.value || "-";
  runMeta.textContent = `Model: ${model} | Temp: ${t} | Top-p: ${p} | Top-k: ${k}`;
}

function switchMode(mode) {
  const isEval = mode === "evaluation";
  evaluationScreen.classList.toggle("hidden", !isEval);
  runScreen.classList.toggle("hidden", isEval);
  tabEvaluation.classList.toggle("active", isEval);
  tabRun.classList.toggle("active", !isEval);
  tabEvaluation.setAttribute("aria-selected", isEval ? "true" : "false");
  tabRun.setAttribute("aria-selected", !isEval ? "true" : "false");
}

// ─── Model Loading & Run Defaults ─────────────────────────────────────────────

function populateRunModelOptions(models) {
  const previous = runModelSelect.value;
  runModelSelect.innerHTML = "";

  if (!models.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No model available";
    runModelSelect.appendChild(opt);
    updateRunMeta();
    return;
  }

  models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    runModelSelect.appendChild(opt);
  });

  if (previous && models.includes(previous)) {
    runModelSelect.value = previous;
  } else {
    runModelSelect.value = models[0];
  }
  updateRunMeta();
}

function syncRunDefaultsFromEval() {
  runTempInput.value = tempInput.value || "0.3";
  runTopPInput.value = topPInput.value || "0.95";
  runTopKInput.value = topKInput.value || "40";

  const evalModels = getModels();
  if (evalModels.length) {
    populateRunModelOptions(evalModels);
    runModelSelect.value = evalModels[0];
  }
  updateRunMeta();
  setRunStatus("Run mode defaults updated from evaluation settings.");
}

async function loadDefaultModels() {
  try {
    const res = await fetch(`${apiBase()}/api/default-models`);
    if (!res.ok) {
      populateRunModelOptions([]);
      setRunStatus(
        `Could not load models from ${apiBase()} (HTTP ${res.status}). Check the Backend URL.`,
        true
      );
      return;
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    modelCapabilities = data.model_capabilities || {};

    if (models.length && !modelsInput.value.trim()) {
      modelsInput.value = models.join(", ");
    }

    const currentEvalModels = getModels();
    populateRunModelOptions(currentEvalModels.length ? currentEvalModels : models);
    updateVisionPanelForSelectedModel();
  } catch (e) {
    populateRunModelOptions([]);
    setRunStatus(
      `Could not reach backend at ${apiBase()} (${e.message}). Start it or fix the Backend URL.`,
      true
    );
  }
}

// ─── Render Helpers ───────────────────────────────────────────────────────────

function scoreChip(label, value) {
  if (value == null) return "";
  const pct = (value * 100).toFixed(1);
  const cls = value >= 0.7 ? "chip-high" : value >= 0.4 ? "chip-mid" : "chip-low";
  return `<span class="chip ${cls}">${label}: ${pct}%</span>`;
}

function renderGenerateResults(results) {
  if (!results.length) {
    resultsContainer.innerHTML = "<p>No results returned.</p>";
    return;
  }

  resultsContainer.innerHTML = results
    .map(
      (r) => `
      <div class="result-card">
        <div class="result-header">
          <span class="model-name">${escapeHtml(r.model)}</span>
          <span class="variant-badge">${escapeHtml(r.prompt_variant || "default")}</span>
        </div>
        <div class="result-output">${escapeHtml(r.output)}</div>
      </div>`
    )
    .join("");
}

function renderEvalResults(data) {
  const { top_results, aggregate_by_model, total_runs } = data;
  const scoredCount = (top_results || []).filter((r) => r.final_score != null).length;

  let html = `<p class="total-runs">Total runs: <strong>${total_runs}</strong></p>`;

  if (total_runs > 0 && scoredCount === 0) {
    html += `<div class="error-box"><strong>No scored outputs.</strong> The selected models likely failed to generate (for example: model not pulled, Ollama not running, or endpoint mismatch). Check backend logs and model availability.</div>`;
  }

  if (aggregate_by_model && Object.keys(aggregate_by_model).length) {
    html += `<h3>Model Summary</h3><div class="aggregate-grid">`;
    for (const [model, stats] of Object.entries(aggregate_by_model)) {
      html += `
        <div class="agg-card">
          <span class="model-name">${escapeHtml(model)}</span>
          ${scoreChip("Avg Score", stats.mean_final_score)}
          <span class="chip chip-neutral">Runs: ${stats.runs}</span>
          ${stats.scored_runs != null ? `<span class="chip chip-neutral">Scored: ${stats.scored_runs}</span>` : ""}
        </div>`;
    }
    html += `</div>`;
  }

  if (top_results && top_results.length) {
    html += `<h3>Top Results</h3>`;
    html += top_results
      .map(
        (r) => `
      <div class="result-card">
        <div class="result-header">
          <span class="model-name">${escapeHtml(r.model)}</span>
          <span class="variant-badge">${escapeHtml(r.prompt_variant)}</span>
          <span class="param-info">temp=${r.temperature} · top_p=${r.top_p} · max_tokens=${r.max_tokens}</span>
        </div>
        <div class="chips-row">
          ${scoreChip("ROUGE-L", r.rouge_l_f1)}
          ${scoreChip("Semantic", r.semantic_similarity)}
          ${scoreChip("Composite", r.composite_score)}
          ${scoreChip("Final", r.final_score)}
        </div>
        <div class="result-output">${escapeHtml(r.output_preview)}${r.output_preview && r.output_preview.length >= 300 ? "..." : ""}</div>
      </div>`
      )
      .join("");
  }

  resultsContainer.innerHTML = html;
}

// ─── Evaluation Actions ───────────────────────────────────────────────────────

async function handleGenerate() {
  const note = noteInput.value.trim();
  const reference = referenceInput.value.trim();

  if (note.length < 20) {
    showEvalError("Engineering note must be at least 20 characters.");
    return;
  }

  if (reference.length >= 20) {
    await handleEvaluate();
    return;
  }

  const models = getModels();
  if (!models.length) {
    showEvalError("Please enter at least one model.");
    return;
  }

  setEvalLoading(true);
  resultsContainer.innerHTML = "<p>Generating...</p>";

  const results = [];
  const errors = [];
  const promptSettings = getPromptSettings();

  for (const model of models) {
    try {
      const payload = {
        engineering_note: note,
        model,
        mode: modeSelect.value,
        prompt_variant: variantSelect.value,
        ...promptSettings,
        params: {
          temperature: parseNumber(tempInput.value, 0.3),
          top_p: parseNumber(topPInput.value, 0.95),
          top_k: parseIntOrNull(topKInput.value),
          max_tokens: 700,
        },
      };

      const res = await fetch(`${apiBase()}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        errors.push(`${model}: ${err.detail || res.statusText}`);
        continue;
      }

      const data = await res.json();
      results.push({ ...data, prompt_variant: variantSelect.value });
    } catch (e) {
      errors.push(`${model}: ${e.message}`);
    }
  }

  setEvalLoading(false);
  renderGenerateResults(results);
  await refreshRuntimeStats();

  if (errors.length) {
    resultsContainer.innerHTML += `<div class="error-box"><strong>Errors:</strong><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`;
  }
}

async function handleEvaluate() {
  const note = noteInput.value.trim();
  const reference = referenceInput.value.trim();

  if (note.length < 20) {
    showEvalError("Engineering note must be at least 20 characters.");
    return;
  }
  if (reference.length < 20) {
    showEvalError("Reference summary must be at least 20 characters for evaluation.");
    return;
  }

  const models = getModels();
  if (!models.length) {
    showEvalError("Please enter at least one model.");
    return;
  }

  setEvalLoading(true);
  resultsContainer.innerHTML = "<p>Evaluating...</p>";

  const promptSettings = getPromptSettings();

  const payload = {
    models,
    prompt_variants: [variantSelect.value],
    temperatures: [parseNumber(tempInput.value, 0.3)],
    top_ps: [parseNumber(topPInput.value, 0.95)],
    top_ks: [parseIntOrNull(topKInput.value)],
    max_tokens: [700],
    repetition_penalties: [1.0],
    mode: modeSelect.value,
    ...promptSettings,
    rubric: { enabled: true },
    dataset: [
      {
        case_id: "ui-eval-001",
        engineering_note: note,
        reference_summary: reference,
      },
    ],
  };

  try {
    const res = await fetch(`${apiBase()}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    const data = await res.json();
    renderEvalResults(data);
  } catch (e) {
    showEvalError(e.message);
  } finally {
    setEvalLoading(false);
    await refreshRuntimeStats();
  }
}

// ─── Run Mode Action ──────────────────────────────────────────────────────────

function selectedModelIsVisionCapable() {
  const model = (runModelSelect.value || "").trim();
  const caps = modelCapabilities[model];
  return !!(caps && caps.vision);
}

function updateVisionPanelForSelectedModel() {
  // Toggle the "passthrough" hint depending on the currently-selected text model.
  if (!visionPassthroughNote) return;
  if (imageState.file && selectedModelIsVisionCapable()) {
    visionPassthroughNote.classList.remove("hidden");
  } else {
    visionPassthroughNote.classList.add("hidden");
  }
}

function setImageStatus(message, isError = false) {
  // Single unified status line for both image analysis and document extraction.
  if (!runUploadStatus) return;
  runUploadStatus.textContent = message || "";
  runUploadStatus.classList.toggle("error-text", !!isError);
}

function showVisionPanel(show) {
  visionPanel.classList.toggle("hidden", !show);
  clearRunFileBtn.classList.toggle("hidden", !show && !imageState.file);
  const layout = document.querySelector(".run-layout-with-vision");
  if (layout) layout.classList.toggle("vision-active", show);
}

function renderVisionAnalysis(analysis) {
  imageState.analysis = analysis;
  visionFilenameEl.textContent = analysis.filename || "—";
  visionModelEl.textContent = analysis.vision_model || "—";
  visionKindEl.textContent = analysis.image_kind || "—";
  const richnessLabel = analysis.richness === "rich"
    ? "rich (caption + OCR)"
    : "normal (caption only)";
  visionRichnessEl.textContent = richnessLabel;
  visionReasonEl.textContent = analysis.reason || "—";
  visionDescriptionEl.value = analysis.description || "";
  updateVisionPanelForSelectedModel();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function clearAttachedImage() {
  imageState.file = null;
  imageState.dataUrl = null;
  imageState.analysis = null;
  if (visionThumb) {
    visionThumb.removeAttribute("src");
    visionThumb.alt = "Attached image preview";
  }
  if (visionDescriptionEl) visionDescriptionEl.value = "";
  showVisionPanel(false);
}

function clearAttachment() {
  clearAttachedImage();
  if (runFileInput) runFileInput.value = "";
  clearRunFileBtn.classList.add("hidden");
  setImageStatus("");
}

function looksLikeImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("image/")) return true;
  const name = (file.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name);
}

async function analyzeAttachedImage() {
  if (!imageState.file) {
    setImageStatus("Choose an image first.", true);
    return;
  }
  const form = new FormData();
  form.append("file", imageState.file);

  try {
    uploadRunFileBtn.disabled = true;
    if (reanalyzeImageBtn) reanalyzeImageBtn.disabled = true;
    setImageStatus(
      selectedModelIsVisionCapable()
        ? "Analyzing image (selected model also supports vision — analysis still runs as a preview)..."
        : "Analyzing image with vision model..."
    );

    const res = await fetch(`${apiBase()}/api/analyze-image`, {
      method: "POST",
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || res.statusText || "Image analysis failed");
    }

    renderVisionAnalysis(data);
    setImageStatus(
      `Analyzed with ${data.vision_model} (${data.image_kind}, ${data.richness}).`
    );
  } catch (e) {
    setImageStatus(`Failed: ${e.message}`, true);
  } finally {
    uploadRunFileBtn.disabled = false;
    if (reanalyzeImageBtn) reanalyzeImageBtn.disabled = false;
  }
}

async function attachImage(file) {
  // Clear any previous image so re-uploads don't keep stale state.
  clearAttachedImage();

  try {
    imageState.file = file;
    imageState.dataUrl = await readFileAsDataUrl(file);
  } catch (e) {
    setImageStatus(`Failed to read image: ${e.message}`, true);
    return;
  }

  visionThumb.src = imageState.dataUrl;
  visionThumb.alt = file.name || "Attached image preview";
  visionFilenameEl.textContent = file.name || "—";
  visionModelEl.textContent = "(pending analysis)";
  visionKindEl.textContent = "—";
  visionRichnessEl.textContent = "—";
  visionReasonEl.textContent = "—";
  visionDescriptionEl.value = "";
  showVisionPanel(true);
  updateVisionPanelForSelectedModel();
  clearRunFileBtn.classList.remove("hidden");

  await analyzeAttachedImage();
}

async function extractDocumentToNotes(file) {
  const form = new FormData();
  form.append("file", file);

  try {
    uploadRunFileBtn.disabled = true;
    setImageStatus(`Extracting text from ${file.name}...`);

    const res = await fetch(`${apiBase()}/api/extract-note-file`, {
      method: "POST",
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || res.statusText || "Upload failed");
    }

    runInput.value = data.extracted_text || "";
    setImageStatus(
      `Loaded ${data.filename} (${data.char_count || 0} chars) into notes.`
    );
    clearRunFileBtn.classList.remove("hidden");
  } catch (e) {
    setImageStatus(`Failed: ${e.message}`, true);
  } finally {
    uploadRunFileBtn.disabled = false;
  }
}

async function handleUnifiedUpload() {
  const file = runFileInput.files && runFileInput.files[0];
  if (!file) {
    setImageStatus("Choose a file first.", true);
    return;
  }

  if (looksLikeImageFile(file)) {
    await attachImage(file);
  } else {
    // Document/text path -- also clear any prior attached image since the
    // notes textarea (not the vision panel) becomes the source of truth.
    clearAttachedImage();
    await extractDocumentToNotes(file);
  }
}

async function handleRunSummarize() {
  const note = runInput.value.trim();
  if (note.length < 20) {
    setRunStatus("Engineering note must be at least 20 characters.", true);
    return;
  }

  const runModel = runModelSelect.value.trim();
  if (!runModel) {
    setRunStatus("Choose a run model in Evaluation Mode settings.", true);
    return;
  }

  setRunLoading(true);
  setRunStatus("Generating summary...");
  runOutput.value = "";

  const promptSettings = getPromptSettings();

  const payload = {
    engineering_note: note,
    model: runModel,
    mode: modeSelect.value,
    prompt_variant: variantSelect.value,
    ...promptSettings,
    params: {
      temperature: parseNumber(runTempInput.value, 0.3),
      top_p: parseNumber(runTopPInput.value, 0.95),
      top_k: parseIntOrNull(runTopKInput.value),
      max_tokens: 700,
    },
  };

  // Attach image context if the user has an image loaded.
  if (imageState.file) {
    if (selectedModelIsVisionCapable() && imageState.dataUrl) {
      // Send image directly; backend will forward to the multimodal model.
      payload.images = [imageState.dataUrl];
    }
    const editedDescription = (visionDescriptionEl.value || "").trim();
    if (editedDescription) {
      payload.image_description = editedDescription;
    }
  }

  try {
    const res = await fetch(`${apiBase()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    const data = await res.json();
    runOutput.value = data.output || "";
    const flags = [];
    if (data.used_images) flags.push("native vision");
    if (data.used_image_description) flags.push("image description");
    const suffix = flags.length ? ` (used: ${flags.join(", ")})` : "";
    setRunStatus(`Summary generated successfully${suffix}.`);

    // Snapshot for the PDF export.
    if ((data.output || "").trim()) {
      lastRunReport = {
        summary: data.output,
        model: runModel,
        mode: modeSelect.value,
        prompt_variant: variantSelect.value,
        engineering_note: note,
        image_description: payload.image_description || null,
      };
      runDownloadPdfBtn.disabled = false;
    } else {
      lastRunReport = null;
      runDownloadPdfBtn.disabled = true;
    }
  } catch (e) {
    setRunStatus(`Failed to summarize: ${e.message}`, true);
    lastRunReport = null;
    runDownloadPdfBtn.disabled = true;
  } finally {
    setRunLoading(false);
  }
}

async function handleRunDownloadPdf() {
  if (!lastRunReport || !(lastRunReport.summary || "").trim()) {
    setRunStatus("Generate a summary first, then download.", true);
    return;
  }

  const originalLabel = runDownloadPdfBtn.textContent;
  try {
    runDownloadPdfBtn.disabled = true;
    runDownloadPdfBtn.textContent = "Preparing PDF...";

    // Build a friendly filename hint from the model name (server still timestamps).
    const slug = (lastRunReport.model || "ngnotes_summary")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "ngnotes_summary";

    const res = await fetch(`${apiBase()}/api/export-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lastRunReport, filename: `ngnotes_${slug}` }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText || "PDF export failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const dispo = res.headers.get("Content-Disposition") || "";
    const match = dispo.match(/filename="?([^";]+)"?/i);
    const filename = match ? match[1] : `ngnotes_${slug}.pdf`;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setRunStatus(`PDF downloaded (${filename}).`);
  } catch (e) {
    setRunStatus(`Failed to download PDF: ${e.message}`, true);
  } finally {
    runDownloadPdfBtn.disabled = !lastRunReport;
    runDownloadPdfBtn.textContent = originalLabel;
  }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

tabEvaluation.addEventListener("click", () => switchMode("evaluation"));
tabRun.addEventListener("click", () => switchMode("run"));

generateBtn.addEventListener("click", handleGenerate);
evaluateBtn.addEventListener("click", handleEvaluate);
runSummarizeBtn.addEventListener("click", handleRunSummarize);
runDownloadPdfBtn.addEventListener("click", handleRunDownloadPdf);
syncRunDefaultsBtn.addEventListener("click", syncRunDefaultsFromEval);
refreshRuntimeBtn.addEventListener("click", refreshRuntimeStats);
exportRuntimeBtn.addEventListener("click", exportRuntimeExcel);
clearRuntimeBtn.addEventListener("click", clearRuntimeData);
uploadEvalNoteBtn.addEventListener("click", () =>
  uploadNoteFile(evalNoteFileInput, noteInput, evalUploadStatus, uploadEvalNoteBtn)
);
uploadRunFileBtn.addEventListener("click", handleUnifiedUpload);
clearRunFileBtn.addEventListener("click", clearAttachment);
reanalyzeImageBtn.addEventListener("click", analyzeAttachedImage);
runFileInput.addEventListener("change", () => {
  // Auto-trigger upload when the user picks a new file via the picker.
  if (runFileInput.files && runFileInput.files[0]) {
    handleUnifiedUpload();
  }
});
evalVoiceBtn.addEventListener("click", () =>
  startVoiceInput(noteInput, evalVoiceStatus, evalVoiceBtn)
);
runVoiceBtn.addEventListener("click", () =>
  startVoiceInput(runInput, runVoiceStatus, runVoiceBtn)
);

backendUrlInput.addEventListener("change", loadDefaultModels);
modelsInput.addEventListener("change", () => {
  const evalModels = getModels();
  if (evalModels.length) {
    populateRunModelOptions(evalModels);
  }
});

[runModelSelect, runTempInput, runTopPInput, runTopKInput].forEach((el) => {
  el.addEventListener("change", updateRunMeta);
});

runModelSelect.addEventListener("change", updateVisionPanelForSelectedModel);

// ─── Init ─────────────────────────────────────────────────────────────────────

switchMode("evaluation");
syncRunDefaultsFromEval();
loadDefaultModels();
refreshRuntimeStats();
