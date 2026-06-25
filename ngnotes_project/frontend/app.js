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
const maxTokensInput = document.getElementById("max-tokens");
const topPInput = document.getElementById("top-p");
const topKInput = document.getElementById("top-k");
const repetitionPenaltyInput = document.getElementById("repetition-penalty");
const minPInput = document.getElementById("min-p");
const hardwareProfileEl = document.getElementById("hardware-profile");
const modelRecommendationEl = document.getElementById("model-recommendation");
const ollamaRecommendationListEl = document.getElementById("ollama-recommendation-list");
const modelParamsRecommendationEl = document.getElementById("model-params-recommendation");
const installModelSelect = document.getElementById("install-model-select");
const applyModelRecommendationBtn = document.getElementById("apply-model-recommendation-btn");
const applyModelParamsBtn = document.getElementById("apply-model-params-btn");
const installModelBtn = document.getElementById("install-model-btn");

const runModelSelect = document.getElementById("run-model");
const runTempInput = document.getElementById("run-temperature");
const runMaxTokensInput = document.getElementById("run-max-tokens");
const runTopPInput = document.getElementById("run-top-p");
const runTopKInput = document.getElementById("run-top-k");
const runRepetitionPenaltyInput = document.getElementById("run-repetition-penalty");
const runMinPInput = document.getElementById("run-min-p");
const runPresetNameInput = document.getElementById("run-preset-name");
const runPresetSelect = document.getElementById("run-preset-select");
const saveRunPresetBtn = document.getElementById("save-run-preset-btn");
const applyRunPresetBtn = document.getElementById("apply-run-preset-btn");
const deleteRunPresetBtn = document.getElementById("delete-run-preset-btn");
const syncRunDefaultsBtn = document.getElementById("sync-run-defaults");

const generateBtn = document.getElementById("generate-btn");
const evaluateBtn = document.getElementById("evaluate-btn");
const resultsContainer = document.getElementById("results-container");
const runtimeStats = document.getElementById("runtime-stats");
const refreshRuntimeBtn = document.getElementById("refresh-runtime-btn");
const exportRuntimeBtn = document.getElementById("export-runtime-btn");
const exportEvalPdfBtn = document.getElementById("export-eval-pdf-btn");
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
const runAnalyzeBtn = document.getElementById("run-analyze-btn");
const runTabAnalyze = document.getElementById("run-tab-analyze");
const runTabStructure = document.getElementById("run-tab-structure");
const runPhaseAnalyze = document.getElementById("run-phase-analyze");
const runPhaseStructure = document.getElementById("run-phase-structure");
const runAnalysisMetaEl = document.getElementById("run-analysis-meta");
const runLlmQuestionsInput = document.getElementById("run-llm-questions");
const runUserAnswersInput = document.getElementById("run-user-answers");
const runGuidanceFieldsEl = document.getElementById("run-guidance-fields");
const runFundamentalSectionsInput = document.getElementById("run-fundamental-sections");
const runVoiceToneInput = document.getElementById("run-voice-tone");
const runCreateCInput = document.getElementById("run-create-c");
const runCreateRInput = document.getElementById("run-create-r");
const runCreateE1Input = document.getElementById("run-create-e1");
const runCreateAInput = document.getElementById("run-create-a");
const runCreateTInput = document.getElementById("run-create-t");
const runCreateE2Input = document.getElementById("run-create-e2");
const runFrontMatterInput = document.getElementById("run-front-matter");
const runBodyMatterInput = document.getElementById("run-body-matter");
const runEndMatterInput = document.getElementById("run-end-matter");

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

// In-memory state for one attached non-image document extracted for run mode.
const documentState = {
  filename: "",
  extractedText: "",
  charCount: 0,
};

const runAnalysisState = {
  completed: false,
  requiresAnswers: false,
};

// Per-model capability cache populated from /api/default-models
let modelCapabilities = {}; // { "qwen3.6:latest": {vision: true, ...}, ... }

const RUN_PRESETS_STORAGE_KEY = "ngnotes_run_param_presets_v1";
const RUN_PRESETS_MAX = 10;

let lastRecommendedModels = [];
let recommendedParamsByModel = {};

function fillInstallCandidates(candidates) {
  installModelSelect.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = candidates.length ? "Choose a model to install" : "No install candidate available";
  installModelSelect.appendChild(empty);

  candidates.forEach((candidate) => {
    const name = typeof candidate === "string" ? candidate : candidate?.name;
    if (!name) return;
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    installModelSelect.appendChild(opt);
  });
}

function applyParamsToRunFields(params) {
  if (!params) return;
  runTempInput.value = params.temperature ?? runTempInput.value;
  runTopPInput.value = params.top_p ?? runTopPInput.value;
  runMinPInput.value = params.min_p ?? runMinPInput.value;
  runTopKInput.value = params.top_k ?? runTopKInput.value;
  runMaxTokensInput.value = params.max_tokens ?? runMaxTokensInput.value;
  runRepetitionPenaltyInput.value = params.repetition_penalty ?? runRepetitionPenaltyInput.value;
}

function renderModelParamsHint(modelName) {
  const name = (modelName || "").trim();
  const p = recommendedParamsByModel[name];
  if (!p) {
    modelParamsRecommendationEl.textContent = "Recommended params for selected model: unavailable.";
    return;
  }
  modelParamsRecommendationEl.textContent =
    `Recommended params for selected model (${name}): temp=${p.temperature}, top_p=${p.top_p}, min_p=${p.min_p}, top_k=${p.top_k}, max_tokens=${p.max_tokens}, repetition_penalty=${p.repetition_penalty}`;
}

function applyRecommendedParamsForSelectedModel() {
  const model = (runModelSelect.value || "").trim();
  if (!model) {
    setRunStatus("Choose a run model first.", true);
    return;
  }
  const params = recommendedParamsByModel[model];
  if (!params) {
    setRunStatus(`No recommended parameters found for ${model}.`, true);
    return;
  }

  applyParamsToRunFields(params);
  updateRunMeta();
  setRunStatus(`Applied recommended params for ${model}.`);
}

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

function parseFloatOrNull(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function getPromptSettings() {
  return {
    system_prompt: systemPromptInput.value.trim() || null,
    user_prompt_template: userPromptTemplateInput.value.trim() || null,
  };
}

function getCurrentRunParamValues() {
  return {
    temperature: runTempInput.value || "0.3",
    max_tokens: runMaxTokensInput.value || "700",
    top_p: runTopPInput.value || "0.95",
    top_k: runTopKInput.value || "40",
    min_p: runMinPInput.value || "0.05",
    repetition_penalty: runRepetitionPenaltyInput.value || "1.0",
  };
}

function getHardwareProfile() {
  const cores = Number(navigator.hardwareConcurrency || 4);
  const memoryGb = Number(navigator.deviceMemory || 8);
  const platform = String(navigator.platform || "unknown");
  return { cores, memoryGb, platform };
}

function extractModelSizeB(modelName) {
  if (!modelName) return null;
  const lower = String(modelName).toLowerCase();
  const match = lower.match(/(\d+)\s*b\b/);
  if (!match) return null;
  const size = Number.parseInt(match[1], 10);
  return Number.isFinite(size) ? size : null;
}

function recommendedMaxModelSize(profile) {
  const isWindows = /win/i.test(profile.platform);
  if (profile.memoryGb <= 8 || profile.cores <= 4) return 7;
  if (profile.memoryGb <= 16 || profile.cores <= 8) return isWindows ? 14 : 16;
  return 32;
}

function updateHardwareRecommendation(availableModels) {
  const profile = getHardwareProfile();
  const maxSize = recommendedMaxModelSize(profile);

  hardwareProfileEl.textContent = `Detected hardware: ${profile.cores} CPU threads, ~${profile.memoryGb} GB memory, ${profile.platform}`;
  modelRecommendationEl.textContent = `Recommended model tier: <= ${maxSize}B for stable local inference.`;

  const models = Array.isArray(availableModels) ? availableModels : [];
  const recommended = models.filter((m) => {
    const size = extractModelSizeB(m);
    return size == null ? false : size <= maxSize;
  });

  // Fallback: if no size-tagged match, keep the first 1-2 models rather than emptying list.
  lastRecommendedModels = recommended.length ? recommended : models.slice(0, 2);
  recommendedParamsByModel = {};
  modelParamsRecommendationEl.textContent = "Recommended params for selected model: unavailable (backend recommendations not loaded).";
}

async function refreshOllamaRecommendations() {
  const profile = getHardwareProfile();
  const url = `${apiBase()}/api/ollama/recommend?cores=${encodeURIComponent(profile.cores)}&memory_gb=${encodeURIComponent(profile.memoryGb)}&platform=${encodeURIComponent(profile.platform)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    hardwareProfileEl.textContent = `Detected hardware: ${data.hardware_profile}`;
    modelRecommendationEl.textContent = `Recommended model tier: <= ${data.recommended_max_b}B for stable local inference.`;

    const rec = Array.isArray(data.recommended_models) ? data.recommended_models : [];
    lastRecommendedModels = rec.map((x) => x.name).filter(Boolean);
    recommendedParamsByModel = {};
    rec.forEach((x) => {
      if (x && x.name && x.recommended_params) {
        recommendedParamsByModel[x.name] = x.recommended_params;
      }
    });
    ollamaRecommendationListEl.textContent = `Recommended installed models: ${lastRecommendedModels.length ? lastRecommendedModels.join(", ") : "none detected"}`;

    const installCandidates = Array.isArray(data.install_candidates) ? data.install_candidates : [];
    installCandidates.forEach((x) => {
      if (x && x.name && x.recommended_params) {
        recommendedParamsByModel[x.name] = x.recommended_params;
      }
    });
    fillInstallCandidates(installCandidates);
    renderModelParamsHint(runModelSelect.value);
  } catch (e) {
    updateHardwareRecommendation(getModels());
    ollamaRecommendationListEl.textContent = `Recommended installed models: ${lastRecommendedModels.length ? lastRecommendedModels.join(", ") : "none detected"}`;
    fillInstallCandidates([]);
    renderModelParamsHint(runModelSelect.value);
  }
}

function applyRecommendedModels() {
  if (!lastRecommendedModels.length) {
    setRunStatus("No recommended models available yet. Load models first.", true);
    return;
  }
  modelsInput.value = lastRecommendedModels.join(", ");
  populateRunModelOptions(lastRecommendedModels);
  if (lastRecommendedModels.length) {
    runModelSelect.value = lastRecommendedModels[0];
    applyRecommendedParamsForSelectedModel();
  }
  renderModelParamsHint(runModelSelect.value);
  updateRunMeta();
  setRunStatus(`Applied recommended models (${lastRecommendedModels.length}).`);
}

async function installSelectedModel() {
  const model = (installModelSelect.value || "").trim();
  if (!model) {
    setRunStatus("Choose a model to install first.", true);
    return;
  }

  const ok = window.confirm(`Install '${model}' via Ollama now? This can take several minutes.`);
  if (!ok) return;

  try {
    installModelBtn.disabled = true;
    installModelBtn.textContent = "Installing...";
    setRunStatus(`Installing ${model} with Ollama...`);

    const res = await fetch(`${apiBase()}/api/ollama/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || res.statusText || "Install failed");
    }

    setRunStatus(`Installed ${model}. Refreshing model list...`);
    await loadDefaultModels();
    await refreshOllamaRecommendations();
    setRunStatus(`Model ${model} installed and available.`);
  } catch (e) {
    setRunStatus(`Model install failed: ${e.message}`, true);
  } finally {
    installModelBtn.disabled = false;
    installModelBtn.textContent = "Install Selected Model";
  }
}

function readRunPresets() {
  try {
    const raw = localStorage.getItem(RUN_PRESETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeRunPresets(presets) {
  localStorage.setItem(RUN_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function renderRunPresetOptions(selectedName = "") {
  const presets = readRunPresets();
  runPresetSelect.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No preset selected";
  runPresetSelect.appendChild(empty);

  presets.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name;
    runPresetSelect.appendChild(opt);
  });

  if (selectedName && presets.some((p) => p.name === selectedName)) {
    runPresetSelect.value = selectedName;
  }
}

function saveRunPreset() {
  const name = (runPresetNameInput.value || "").trim();
  if (!name) {
    setRunStatus("Enter a preset name before saving.", true);
    return;
  }

  const values = getCurrentRunParamValues();
  const presets = readRunPresets();
  const existingIdx = presets.findIndex((p) => p.name === name);

  if (existingIdx >= 0) {
    presets[existingIdx] = { name, values };
    writeRunPresets(presets);
    renderRunPresetOptions(name);
    setRunStatus(`Preset '${name}' updated.`);
    return;
  }

  if (presets.length >= RUN_PRESETS_MAX) {
    setRunStatus(`You can store up to ${RUN_PRESETS_MAX} run presets. Delete one or reuse an existing name.`, true);
    return;
  }

  presets.push({ name, values });
  writeRunPresets(presets);
  renderRunPresetOptions(name);
  setRunStatus(`Preset '${name}' saved.`);
}

function applyRunPreset() {
  const selected = (runPresetSelect.value || "").trim();
  if (!selected) {
    setRunStatus("Choose a preset to apply.", true);
    return;
  }

  const preset = readRunPresets().find((p) => p.name === selected);
  if (!preset || !preset.values) {
    setRunStatus("Selected preset could not be loaded.", true);
    return;
  }

  runTempInput.value = preset.values.temperature ?? runTempInput.value;
  runMaxTokensInput.value = preset.values.max_tokens ?? runMaxTokensInput.value;
  runTopPInput.value = preset.values.top_p ?? runTopPInput.value;
  runTopKInput.value = preset.values.top_k ?? runTopKInput.value;
  runMinPInput.value = preset.values.min_p ?? runMinPInput.value;
  runRepetitionPenaltyInput.value = preset.values.repetition_penalty ?? runRepetitionPenaltyInput.value;
  updateRunMeta();
  setRunStatus(`Preset '${selected}' applied.`);
}

function deleteRunPreset() {
  const selected = (runPresetSelect.value || "").trim();
  if (!selected) {
    setRunStatus("Choose a preset to delete.", true);
    return;
  }

  const ok = window.confirm(`Delete run preset '${selected}'?`);
  if (!ok) return;

  const next = readRunPresets().filter((p) => p.name !== selected);
  writeRunPresets(next);
  renderRunPresetOptions("");
  setRunStatus(`Preset '${selected}' deleted.`);
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

function setRunAnalysisMeta(message, isError = false) {
  if (!runAnalysisMetaEl) return;
  runAnalysisMetaEl.textContent = message || "";
  runAnalysisMetaEl.classList.remove("hidden");
  runAnalysisMetaEl.classList.toggle("error-text", !!isError);
}

function switchRunWorkflowTab(tab) {
  const showAnalyze = tab !== "structure";
  runPhaseAnalyze.classList.toggle("hidden", !showAnalyze);
  runPhaseStructure.classList.toggle("hidden", showAnalyze);
  runTabAnalyze.classList.toggle("active", showAnalyze);
  runTabStructure.classList.toggle("active", !showAnalyze);
  runTabAnalyze.setAttribute("aria-selected", showAnalyze ? "true" : "false");
  runTabStructure.setAttribute("aria-selected", !showAnalyze ? "true" : "false");
}

function setStructureTabEnabled(enabled) {
  runTabStructure.classList.toggle("hidden", !enabled);
  if (!enabled) {
    switchRunWorkflowTab("analyze");
  }
}

function setRunAnalysisStale() {
  runAnalysisState.completed = false;
  runAnalysisState.requiresAnswers = false;
  setStructureTabEnabled(false);
  if (!runAnalysisMetaEl || runAnalysisMetaEl.classList.contains("hidden")) return;
  setRunAnalysisMeta("Analysis is stale. Click Analyze & Ask Questions again before final summarize.");
}

function setSuggestedDraftFields(suggested) {
  if (!suggested) return;
  const suggestedParts = [];
  if (suggested.context) suggestedParts.push(`Context:\n${suggested.context}`);
  if (suggested.risks) suggestedParts.push(`Risks:\n${suggested.risks}`);
  if (suggested.open_questions) suggestedParts.push(`Open Questions:\n${suggested.open_questions}`);
  if (suggested.document_sections) suggestedParts.push(`Document Sections:\n${suggested.document_sections}`);

  if (suggestedParts.length) {
    const existingSections = (runFundamentalSectionsInput.value || "").trim();
    runFundamentalSectionsInput.value = existingSections
      ? `${existingSections}\n\n${suggestedParts.join("\n\n")}`
      : suggestedParts.join("\n\n");
  }

  if (suggested.voice_tone) {
    const existingTone = (runVoiceToneInput.value || "").trim();
    runVoiceToneInput.value = existingTone
      ? `${existingTone}\n\nSuggested tone: ${suggested.voice_tone}`
      : suggested.voice_tone;
  }

  const create = suggested.create || {};
  const matter = suggested.matter || {};
  runCreateCInput.value = create.c || runCreateCInput.value;
  runCreateRInput.value = create.r || runCreateRInput.value;
  runCreateE1Input.value = create.e1 || runCreateE1Input.value;
  runCreateAInput.value = create.a || runCreateAInput.value;
  runCreateTInput.value = create.t || runCreateTInput.value;
  runCreateE2Input.value = create.e2 || runCreateE2Input.value;
  runFrontMatterInput.value = matter.front || runFrontMatterInput.value;
  runBodyMatterInput.value = matter.body || runBodyMatterInput.value;
  runEndMatterInput.value = matter.end || runEndMatterInput.value;
}

function extractJsonObject(text) {
  const src = String(text || "").trim();
  if (!src) return null;

  const fenced = src.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : src;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch (_) {
    return null;
  }
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

async function exportEvalPdfReport() {
  const originalLabel = exportEvalPdfBtn.textContent;
  try {
    exportEvalPdfBtn.disabled = true;
    exportEvalPdfBtn.textContent = "Generating Report...";

    // Pass the current run-model so the user's chosen LLM writes the report.
    const model = (runModelSelect.value || "").trim();
    const url = model
      ? `${apiBase()}/api/export-eval-report-pdf?model=${encodeURIComponent(model)}`
      : `${apiBase()}/api/export-eval-report-pdf`;

    const res = await fetch(url, { method: "POST" });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText || "PDF report generation failed");
    }

    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const dispo = res.headers.get("Content-Disposition") || "";
    const match = dispo.match(/filename="?([^";\/\\]+)"?/i);
    const filename = match ? match[1] : `ngnotes_eval_report_${Date.now()}.pdf`;

    const link = document.createElement("a");
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objUrl);
    setRunStatus(`Evaluation PDF report downloaded (${filename}).`);
  } catch (e) {
    showEvalError(`Failed to generate PDF report: ${e.message}`);
  } finally {
    exportEvalPdfBtn.disabled = false;
    exportEvalPdfBtn.textContent = originalLabel;
  }
}

async function clearRuntimeData() {
  const confirmed = window.confirm(
    "Are you sure you want to clear all stored runtime data? This cannot be undone."
  );
  if (!confirmed) {
    return;
  }

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
  const mt = runMaxTokensInput.value || "-";
  const p = runTopPInput.value || "-";
  const mp = runMinPInput.value || "-";
  const k = runTopKInput.value || "-";
  const rp = runRepetitionPenaltyInput.value || "-";
  runMeta.textContent = `Model: ${model} | Temp: ${t} | MaxTok: ${mt} | Top-p: ${p} | Min-p: ${mp} | Top-k: ${k} | Repeat: ${rp}`;
}

function switchMode(mode) {
  const isEval = mode === "evaluation";
  evaluationScreen.classList.toggle("hidden", !isEval);
  runScreen.classList.toggle("hidden", isEval);
  evaluationScreen.classList.toggle("mode-panel-active", isEval);
  runScreen.classList.toggle("mode-panel-active", !isEval);
  evaluationScreen.hidden = !isEval;
  runScreen.hidden = isEval;
  evaluationScreen.setAttribute("aria-hidden", isEval ? "false" : "true");
  runScreen.setAttribute("aria-hidden", isEval ? "true" : "false");
  tabEvaluation.classList.toggle("active", isEval);
  tabRun.classList.toggle("active", !isEval);
  tabEvaluation.setAttribute("aria-selected", isEval ? "true" : "false");
  tabRun.setAttribute("aria-selected", !isEval ? "true" : "false");
  tabEvaluation.setAttribute("tabindex", isEval ? "0" : "-1");
  tabRun.setAttribute("tabindex", isEval ? "-1" : "0");
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
  runMaxTokensInput.value = maxTokensInput.value || "700";
  runTopPInput.value = topPInput.value || "0.95";
  runMinPInput.value = minPInput.value || "0.05";
  runTopKInput.value = topKInput.value || "40";
  runRepetitionPenaltyInput.value = repetitionPenaltyInput.value || "1.0";

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
    const targetModels = currentEvalModels.length ? currentEvalModels : models;
    populateRunModelOptions(targetModels);
    updateHardwareRecommendation(models);
    await refreshOllamaRecommendations();
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
          <span class="param-info">temp=${r.temperature} · top_p=${r.top_p} · min_p=${r.min_p ?? "-"} · top_k=${r.top_k ?? "-"} · rep=${r.repetition_penalty ?? "-"} · max_tokens=${r.max_tokens}</span>
        </div>
        <div class="chips-row">
          ${scoreChip("ROUGE-L", r.rouge_l_f1)}
          ${scoreChip("Semantic", r.semantic_similarity)}
          ${scoreChip("Composite", r.composite_score)}
          ${scoreChip("Groundedness", r.hallucination_score)}
          ${scoreChip("Ctx Adherence", r.context_adherence)}
          ${scoreChip("Domain Fluency", r.domain_fluency)}
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
    showEvalError("Source notes must be at least 20 characters.");
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
          min_p: parseFloatOrNull(minPInput.value),
          top_k: parseIntOrNull(topKInput.value),
          repetition_penalty: parseFloatOrNull(repetitionPenaltyInput.value),
          max_tokens: parseIntOrNull(maxTokensInput.value) || 700,
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
    showEvalError("Source notes must be at least 20 characters.");
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
    min_ps: [parseFloatOrNull(minPInput.value)],
    top_ks: [parseIntOrNull(topKInput.value)],
    max_tokens: [parseIntOrNull(maxTokensInput.value) || 700],
    repetition_penalties: [parseFloatOrNull(repetitionPenaltyInput.value)],
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

function clearAttachedDocument() {
  documentState.filename = "";
  documentState.extractedText = "";
  documentState.charCount = 0;
}

function clearAttachment() {
  clearAttachedImage();
  clearAttachedDocument();
  if (runFileInput) runFileInput.value = "";
  clearRunFileBtn.classList.add("hidden");
  setImageStatus("");
  setRunAnalysisStale();
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

    const extracted = (data.extracted_text || "").trim();
    if (!extracted) {
      clearAttachedDocument();
      setImageStatus(`Loaded ${data.filename}, but no extractable text was found.`);
      clearRunFileBtn.classList.remove("hidden");
      return;
    }

    documentState.filename = data.filename || file.name || "attached_file";
    documentState.extractedText = extracted;
    documentState.charCount = data.char_count || extracted.length;
    setImageStatus(
      `Attached ${documentState.filename} (${documentState.charCount} chars) for summarization.`
    );
    clearRunFileBtn.classList.remove("hidden");
  } catch (e) {
    clearAttachedDocument();
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
    // Document/text path -- keep any attached image so summarize can combine
    // notes + extracted file text + image analysis in one report.
    await extractDocumentToNotes(file);
  }
  setRunAnalysisStale();
}

function buildRunSourceContext() {
  const note = (runInput.value || "").trim();
  const documentText = (documentState.extractedText || "").trim();
  const description = (visionDescriptionEl.value || "").trim();

  const parts = [];
  if (note) parts.push(`Source Notes:\n${note}`);
  if (documentText) {
    const name = documentState.filename || "attached_file";
    parts.push(`Attached File Extract (${name}):\n${documentText}`);
  }
  if (description) parts.push(`Image Analysis Description:\n${description}`);

  return parts.join("\n\n");
}

async function handleRunAnalyze() {
  const sourceContext = buildRunSourceContext();
  if (sourceContext.length < 20) {
    setRunStatus("Add at least 20 characters of notes, file text, or image description before analysis.", true);
    return false;
  }

  const runModel = runModelSelect.value.trim();
  if (!runModel) {
    setRunStatus("Choose a run model in Evaluation Mode settings.", true);
    return false;
  }

  const analysisPrompt = [
    "You are a document planning and factuality guard assistant.",
    "Analyze the source content and produce ONLY JSON (no markdown, no extra text).",
    "If facts are missing, ambiguous, or hallucination risk is medium/high, you MUST ask clarifying questions.",
    "JSON schema:",
    "{",
    '  "status": "ready" | "needs_clarification",',
    '  "confidence": 0.0 to 1.0,',
    '  "hallucination_risk": "low" | "medium" | "high",',
    '  "reason": "short explanation",',
    '  "questions": ["question 1", "question 2"],',
    '  "suggested": {',
    '    "context": "...",',
    '    "risks": "...",',
    '    "open_questions": "...",',
    '    "document_sections": "...",',
    '    "voice_tone": "...",',
    '    "create": {"c":"...","r":"...","e1":"...","a":"...","t":"...","e2":"..."},',
    '    "matter": {"front":"...","body":"...","end":"..."}',
    "  }",
    "}",
    "",
    "Source content:",
    sourceContext,
  ].join("\n");

  const promptSettings = getPromptSettings();
  const payload = {
    engineering_note: analysisPrompt,
    model: runModel,
    mode: modeSelect.value,
    prompt_variant: variantSelect.value,
    ...promptSettings,
    params: {
      temperature: 0.2,
      top_p: 0.9,
      min_p: parseFloatOrNull(runMinPInput.value),
      top_k: parseIntOrNull(runTopKInput.value),
      repetition_penalty: parseFloatOrNull(runRepetitionPenaltyInput.value),
      max_tokens: parseIntOrNull(runMaxTokensInput.value) || 700,
    },
  };

  try {
    runAnalyzeBtn.disabled = true;
    runAnalyzeBtn.textContent = "Analyzing...";
    setRunStatus("Analyzing source and generating clarifying questions...");

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
    const parsed = extractJsonObject(data.output || "");
    if (!parsed) {
      runAnalysisState.completed = true;
      runAnalysisState.requiresAnswers = true;
      runLlmQuestionsInput.value = "1. I could not parse structured analysis output.\n2. Please provide missing context and desired structure in Your Answers.";
      setStructureTabEnabled(true);
      switchRunWorkflowTab("structure");
      setRunAnalysisMeta("Analysis output was unstructured, so clarification is required before final summarize.", true);
      setRunStatus("Analysis complete. Please provide answers, then click Summarize.");
      return true;
    }

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.map((q) => String(q || "").trim()).filter(Boolean)
      : [];
    runLlmQuestionsInput.value = questions.length
      ? questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "No clarifying questions from the model.";

    const suggested = parsed.suggested || {};
    setSuggestedDraftFields(suggested);

    if (runGuidanceFieldsEl) runGuidanceFieldsEl.classList.remove("hidden");
    setStructureTabEnabled(true);
    switchRunWorkflowTab("structure");

    const confidence = Number(parsed.confidence);
    const risk = String(parsed.hallucination_risk || "").toLowerCase();
    const needsByStatus = String(parsed.status || "") === "needs_clarification";
    const needsByRisk = risk === "medium" || risk === "high";
    const needsByConfidence = Number.isFinite(confidence) ? confidence < 0.75 : false;

    runAnalysisState.completed = true;
    runAnalysisState.requiresAnswers = needsByStatus || needsByRisk || needsByConfidence || questions.length > 0;

    const summary = `Analysis ready. status=${parsed.status || "unknown"}, risk=${risk || "unknown"}, confidence=${Number.isFinite(confidence) ? confidence.toFixed(2) : "n/a"}.`;
    setRunAnalysisMeta(
      runAnalysisState.requiresAnswers
        ? `${summary} Please answer questions before final summarize.`
        : `${summary} You can summarize now or refine suggested structure first.`,
      false
    );
    setRunStatus("Analysis complete.");
    return true;
  } catch (e) {
    setRunStatus(`Failed to analyze: ${e.message}`, true);
    return false;
  } finally {
    runAnalyzeBtn.disabled = false;
    runAnalyzeBtn.textContent = "Analyze & Ask Questions";
  }
}

function buildCombinedRunInput() {
  const sourceContext = buildRunSourceContext();
  const description = (visionDescriptionEl.value || "").trim();
  const llmQuestions = (runLlmQuestionsInput.value || "").trim();
  const userAnswers = (runUserAnswersInput.value || "").trim();
  const fundamentalSections = (runFundamentalSectionsInput.value || "").trim();
  const voiceTone = (runVoiceToneInput.value || "").trim();
  const createC = (runCreateCInput.value || "").trim();
  const createR = (runCreateRInput.value || "").trim();
  const createE1 = (runCreateE1Input.value || "").trim();
  const createA = (runCreateAInput.value || "").trim();
  const createT = (runCreateTInput.value || "").trim();
  const createE2 = (runCreateE2Input.value || "").trim();
  const frontMatter = (runFrontMatterInput.value || "").trim();
  const bodyMatter = (runBodyMatterInput.value || "").trim();
  const endMatter = (runEndMatterInput.value || "").trim();

  const parts = [];
  if (sourceContext) parts.push(sourceContext);
  if (fundamentalSections) {
    parts.push(`Document Sections (author-defined):\n${fundamentalSections}`);
  }
  if (voiceTone) {
    parts.push(`Voice & Tone Guidance:\n${voiceTone}`);
  }

  const createParts = [];
  if (createC) createParts.push(`C: ${createC}`);
  if (createR) createParts.push(`R: ${createR}`);
  if (createE1) createParts.push(`E1: ${createE1}`);
  if (createA) createParts.push(`A: ${createA}`);
  if (createT) createParts.push(`T: ${createT}`);
  if (createE2) createParts.push(`E2: ${createE2}`);
  if (createParts.length) {
    parts.push(`CREATE Framework Guidance:\n${createParts.join("\n")}`);
  }

  const matterParts = [];
  if (frontMatter) matterParts.push(`Front Matter:\n${frontMatter}`);
  if (bodyMatter) matterParts.push(`Body Matter:\n${bodyMatter}`);
  if (endMatter) matterParts.push(`End Matter:\n${endMatter}`);
  if (matterParts.length) {
    parts.push(`Document Matter Structure:\n${matterParts.join("\n\n")}`);
  }

  if (llmQuestions && llmQuestions !== "No clarifying questions from the model.") {
    parts.push(`LLM Clarifying Questions:\n${llmQuestions}`);
  }
  if (userAnswers) {
    parts.push(`Author Answers To Clarifying Questions:\n${userAnswers}`);
  }

  if (description) parts.push(`Image Analysis Description:\n${description}`);

  return {
    combinedText: parts.join("\n\n"),
    description,
    userAnswers,
  };
}

async function handleRunSummarize() {
  if (!runAnalysisState.completed) {
    const ok = await handleRunAnalyze();
    if (!ok) return;
    setRunStatus("Analysis completed. Review questions/suggested structure, answer if needed, then click Summarize.");
    return;
  }

  const { combinedText, userAnswers } = buildCombinedRunInput();
  if (runAnalysisState.requiresAnswers && String(userAnswers || "").trim().length < 10) {
    setRunStatus("Model requested clarification. Please answer the questions before final summarize.", true);
    return;
  }

  if (combinedText.length < 20) {
    setRunStatus("Add at least 20 characters of notes, file text, or image description.", true);
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
    engineering_note: combinedText,
    model: runModel,
    mode: modeSelect.value,
    prompt_variant: variantSelect.value,
    ...promptSettings,
    params: {
      temperature: parseNumber(runTempInput.value, 0.3),
      top_p: parseNumber(runTopPInput.value, 0.95),
      min_p: parseFloatOrNull(runMinPInput.value),
      top_k: parseIntOrNull(runTopKInput.value),
      repetition_penalty: parseFloatOrNull(runRepetitionPenaltyInput.value),
      max_tokens: parseIntOrNull(runMaxTokensInput.value) || 700,
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
        engineering_note: combinedText,
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
runAnalyzeBtn.addEventListener("click", handleRunAnalyze);
runTabAnalyze.addEventListener("click", () => switchRunWorkflowTab("analyze"));
runTabStructure.addEventListener("click", () => {
  if (!runTabStructure.classList.contains("hidden")) {
    switchRunWorkflowTab("structure");
  }
});
runDownloadPdfBtn.addEventListener("click", handleRunDownloadPdf);
saveRunPresetBtn.addEventListener("click", saveRunPreset);
applyRunPresetBtn.addEventListener("click", applyRunPreset);
deleteRunPresetBtn.addEventListener("click", deleteRunPreset);
applyModelRecommendationBtn.addEventListener("click", applyRecommendedModels);
applyModelParamsBtn.addEventListener("click", applyRecommendedParamsForSelectedModel);
installModelBtn.addEventListener("click", installSelectedModel);
syncRunDefaultsBtn.addEventListener("click", syncRunDefaultsFromEval);
refreshRuntimeBtn.addEventListener("click", refreshRuntimeStats);
exportRuntimeBtn.addEventListener("click", exportRuntimeExcel);
exportEvalPdfBtn.addEventListener("click", exportEvalPdfReport);
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

runInput.addEventListener("input", setRunAnalysisStale);
visionDescriptionEl.addEventListener("input", setRunAnalysisStale);

backendUrlInput.addEventListener("change", loadDefaultModels);
modelsInput.addEventListener("change", () => {
  const evalModels = getModels();
  if (evalModels.length) {
    populateRunModelOptions(evalModels);
  }
  updateHardwareRecommendation(evalModels);
});

[runModelSelect, runTempInput, runMaxTokensInput, runTopPInput, runMinPInput, runTopKInput, runRepetitionPenaltyInput].forEach((el) => {
  el.addEventListener("change", updateRunMeta);
});

runModelSelect.addEventListener("change", updateVisionPanelForSelectedModel);
runModelSelect.addEventListener("change", setRunAnalysisStale);
runModelSelect.addEventListener("change", () => renderModelParamsHint(runModelSelect.value));

// ─── Init ─────────────────────────────────────────────────────────────────────

switchMode("evaluation");
setStructureTabEnabled(false);
switchRunWorkflowTab("analyze");
renderRunPresetOptions();
syncRunDefaultsFromEval();
updateHardwareRecommendation(getModels());
loadDefaultModels();
refreshRuntimeStats();
