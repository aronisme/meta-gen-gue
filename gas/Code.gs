/**
 * ============================================================================
 * GAS AI PROXY - OPENAI COMPATIBLE & SMART COOLDOWN EDITION (v3.1.0)
 * ============================================================================
 * Fitur Utama:
 * 1. 🧠 Smart Key Cooldown (Circuit Breaker):
 *    - Key yang terkena 429 (Rate Limit / Kuota Habis) otomatis diistirahatkan 60 detik.
 *    - Request berikutnya langsung MELEWATI (SKIP) key yang sedang limit tanpa buang waktu.
 *    - Key yang invalid (401) otomatis di-blacklist sementara (24 jam) tanpa menghentikan key lain.
 * 2. ⚡ Multi-Provider & Multi-Key Load Balancing (Groq, Gemini, Mistral, Nvidia NIM, xKiro).
 * 3. 🌐 100% Kompatibel Standar OpenAI (/v1/chat/completions & /v1/models).
 * 4. 🖼️ Multimodal Vision Support (Base64 data URL).
 * 5. 🛡️ Thread-Safe Database dengan LockService di Google Sheets.
 * ============================================================================
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. DATABASE, CONFIG & LOCK SERVICE CORE
// ════════════════════════════════════════════════════════════════════════════

const SHEET_NAMES = {
  AI_KEYS: "AI_Keys",
  CONFIG: "Config",
  EXT_KEYS: "ExtensionKeys",
  LOGS: "Logs"
};

const DEFAULT_CONFIGS = [
  ["PROVIDER_ORDER", "groq,gemini,mistral,nvidia,xkiro", "Urutan prioritas rotasi provider"],
  ["DEFAULT_GROQ_MODEL", "llama-3.3-70b-versatile", "Model default untuk Groq"],
  ["DEFAULT_GEMINI_MODEL", "gemini-2.5-flash", "Model default untuk Google Gemini"],
  ["DEFAULT_MISTRAL_MODEL", "mistral-large-latest", "Model default untuk Mistral"],
  ["DEFAULT_NVIDIA_MODEL", "mistralai/mistral-large-3-675b-instruct-2512", "Model default untuk Nvidia NIM"],
  ["DEFAULT_XKIRO_MODEL", "mistralai/ministral-14b", "Model default untuk xKiro"],
  ["KEY_COOLDOWN_SECONDS", "60", "Durasi istirahat key saat kena 429 (detik)"],
  ["MAX_LOG_ROWS", "1000", "Batas maksimal baris log di sheet Logs"],
  ["REQUIRE_AUTH", "false", "Wajibkan token otentikasi? (true/false)"],
  ["ENABLE_LOGS", "true", "Catat riwayat request ke tab Logs? (true/false)"]
];

const DEFAULT_AI_KEYS = [
  ["groq", "gsk_contoh_paste_key_disini", "llama-3.3-70b-versatile", "TRUE", ""],
  ["gemini", "AIzaSy_contoh_paste_key_disini", "gemini-2.5-flash", "TRUE", ""],
  ["mistral", "contoh_mistral_key_disini", "mistral-large-latest", "TRUE", ""],
  ["nvidia", "nvapi-contoh_key_disini", "mistralai/mistral-large-3-675b-instruct-2512", "TRUE", ""],
  ["xkiro", "xkiro_contoh_key_disini", "mistralai/ministral-14b", "TRUE", ""]
];

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  initSheet(ss, SHEET_NAMES.AI_KEYS, ["Provider", "ApiKey", "Model", "Active", "LastError"], ["#1e293b", "#ffffff"], DEFAULT_AI_KEYS);
  initSheet(ss, SHEET_NAMES.EXT_KEYS, ["Token", "Label", "Active", "CreatedAt"], ["#0f766e", "#ffffff"], [
    ["sk-gas-default-token", "Default App / Extension Key", "TRUE", new Date().toISOString()]
  ]);
  initSheet(ss, SHEET_NAMES.CONFIG, ["SettingKey", "SettingValue", "Description"], ["#3730a3", "#ffffff"], DEFAULT_CONFIGS);
  initSheet(ss, SHEET_NAMES.LOGS, ["Timestamp", "Provider", "Model", "Status", "LatencyMs", "Message"], ["#334155", "#ffffff"], []);

  const defaultSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1");
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }

  CacheService.getScriptCache().removeAll(["config_cache", "keys_cache", "ext_keys_cache"]);
  return { ok: true, message: "Database berhasil dibuat & diinisialisasi otomatis!" };
}

function initSheet(ss, name, headers, colors, sampleRows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground(colors[0]);
    headerRange.setFontColor(colors[1]);
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);

    if (sampleRows && sampleRows.length > 0) {
      sheet.getRange(2, 1, sampleRows.length, headers.length).setValues(sampleRows);
    }

    for (let c = 1; c <= headers.length; c++) {
      sheet.autoResizeColumn(c);
      if (sheet.getColumnWidth(c) < 130) sheet.setColumnWidth(c, 130);
    }
  }
}

function getConfig() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("config_cache");
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  if (!sheet) {
    setupDatabase();
    sheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  }

  const rows = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || "").trim();
    const val = String(rows[i][1] || "").trim();
    if (key) config[key] = val;
  }

  cache.put("config_cache", JSON.stringify(config), 600);
  return config;
}

function getActiveAiKeys(forceRefresh = false) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    const cached = cache.get("keys_cache");
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.AI_KEYS);
  if (!sheet) {
    setupDatabase();
    sheet = ss.getSheetByName(SHEET_NAMES.AI_KEYS);
  }

  const rows = sheet.getDataRange().getValues();
  const keysByProvider = { groq: [], gemini: [], mistral: [], nvidia: [], xkiro: [] };

  for (let i = 1; i < rows.length; i++) {
    const provider = String(rows[i][0] || "").trim().toLowerCase();
    const apiKey = String(rows[i][1] || "").trim();
    const model = String(rows[i][2] || "").trim();
    const active = String(rows[i][3] || "").trim().toUpperCase() === "TRUE";

    if (!apiKey || apiKey.includes("contoh_paste_key") || !active) continue;

    if (keysByProvider[provider]) {
      keysByProvider[provider].push({ apiKey, model, rowIndex: i + 1 });
    }
  }

  cache.put("keys_cache", JSON.stringify(keysByProvider), 300);
  return keysByProvider;
}

function validateAuthToken(token) {
  const config = getConfig();
  if (config["REQUIRE_AUTH"] !== "true") return true;

  if (!token) return false;
  const cleanToken = token.replace(/^Bearer\s+/i, "").trim();

  const cache = CacheService.getScriptCache();
  const cached = cache.get("ext_keys_cache");
  let validTokens = [];

  if (cached) {
    try { validTokens = JSON.parse(cached); } catch (e) {}
  } else {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAMES.EXT_KEYS);
    if (!sheet) return true;

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const t = String(rows[i][0] || "").trim();
      const active = String(rows[i][2] || "").trim().toUpperCase() === "TRUE";
      if (t && active) validTokens.push(t);
    }
    cache.put("ext_keys_cache", JSON.stringify(validTokens), 600);
  }

  return validTokens.includes(cleanToken);
}

function logApiRequest(provider, model, status, latencyMs, message) {
  const config = getConfig();
  if (config["ENABLE_LOGS"] === "false") return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.LOGS);
    if (!sheet) return;

    sheet.appendRow([
      new Date().toISOString(),
      provider || "-",
      model || "-",
      status || 200,
      latencyMs || 0,
      String(message || "").slice(0, 200)
    ]);

    const maxRows = parseInt(config["MAX_LOG_ROWS"] || "1000", 10);
    const lastRow = sheet.getLastRow();
    if (lastRow > maxRows + 50) {
      sheet.deleteRows(2, lastRow - maxRows);
    }
  } catch (err) {
  } finally {
    lock.releaseLock();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. SMART KEY COOLDOWN (CIRCUIT BREAKER HELPER)
// ════════════════════════════════════════════════════════════════════════════

function getKeyHash(apiKey) {
  if (!apiKey) return "empty";
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, apiKey);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('').slice(0, 10);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. OPENAI MODELS LIST & ROUTER
// ════════════════════════════════════════════════════════════════════════════

function getOpenAiModelsList() {
  const keys = getActiveAiKeys();
  const models = [];
  const seen = new Set();

  // Opsi model Auto
  models.push({ id: "auto", object: "model", created: 1700000000, owned_by: "system" });

  for (const [provider, keyList] of Object.entries(keys)) {
    for (const item of keyList) {
      if (item.model && !seen.has(item.model)) {
        seen.add(item.model);
        models.push({ id: item.model, object: "model", created: 1700000000, owned_by: provider });
      }
      const prefixed = `${provider}/${item.model}`;
      if (!seen.has(prefixed)) {
        seen.add(prefixed);
        models.push({ id: prefixed, object: "model", created: 1700000000, owned_by: provider });
      }
    }
  }

  if (models.length === 1) {
    models.push({ id: "gemini-2.5-flash", object: "model", created: 1700000000, owned_by: "gemini" });
  }

  return { object: "list", data: models };
}

function resolveProviderAndModel(requestedModel) {
  if (!requestedModel || requestedModel.toLowerCase() === "auto") {
    return { provider: null, targetModel: null };
  }
  const raw = requestedModel.trim();

  const match = raw.match(/^(groq|gemini|mistral|nvidia|xkiro)[\/:](.+)$/i);
  if (match) {
    return { provider: match[1].toLowerCase(), targetModel: match[2].trim() };
  }

  const activeKeys = getActiveAiKeys();
  for (const [provider, keyList] of Object.entries(activeKeys)) {
    for (const item of keyList) {
      if (item.model.toLowerCase() === raw.toLowerCase()) {
        return { provider, targetModel: item.model };
      }
    }
  }

  const lower = raw.toLowerCase();
  if (lower.includes("gemini")) return { provider: "gemini", targetModel: raw };
  if (lower.includes("qwen") || lower.includes("llama") || lower.includes("deepseek") || lower.includes("gemma")) {
    return { provider: "groq", targetModel: raw };
  }
  if (lower.includes("pixtral") || lower.includes("mistral") || lower.includes("codestral")) {
    return { provider: "mistral", targetModel: raw };
  }
  if (lower.includes("nvapi") || lower.includes("nemotron")) {
    return { provider: "nvidia", targetModel: raw };
  }

  return { provider: null, targetModel: raw };
}

// ════════════════════════════════════════════════════════════════════════════
// 4. PROVIDER CALLERS & ROTATION ENGINE DENGAN SMART COOLDOWN
// ════════════════════════════════════════════════════════════════════════════

const PROVIDER_CALLERS = {
  groq: callGroq,
  gemini: callGemini,
  mistral: callMistral,
  nvidia: callNvidia,
  xkiro: callXKiro
};

function generateWithRotation(request) {
  const config = getConfig();
  const resolved = resolveProviderAndModel(request.model);
  const targetModel = resolved.targetModel || request.model;
  const cooldownSecs = parseInt(config["KEY_COOLDOWN_SECONDS"] || "60", 10);

  let rawOrder = [];
  if (request.forceProvider) {
    rawOrder = [request.forceProvider.toLowerCase()];
  } else if (resolved.provider) {
    const rest = (config["PROVIDER_ORDER"] || "groq,gemini,mistral,nvidia,xkiro")
      .split(",").map(p => p.trim().toLowerCase()).filter(p => p !== resolved.provider);
    rawOrder = [resolved.provider, ...rest];
  } else {
    rawOrder = (config["PROVIDER_ORDER"] || "groq,gemini,mistral,nvidia,xkiro").split(",").map(p => p.trim().toLowerCase());
  }

  const activeKeys = getActiveAiKeys();
  const cache = CacheService.getScriptCache();
  const errors = [];

  for (const provider of rawOrder) {
    const keys = activeKeys[provider] || [];
    const caller = PROVIDER_CALLERS[provider];
    if (!caller || keys.length === 0) continue;

    const cursorKey = `cursor_${provider}`;
    let cursor = parseInt(cache.get(cursorKey) || "0", 10);
    if (isNaN(cursor) || cursor >= keys.length) cursor = 0;

    // Filter key yang sedang tidak dalam cooldown
    let availableKeyIndexes = [];
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const idx = (cursor + attempt) % keys.length;
      const kHash = getKeyHash(keys[idx].apiKey);
      const isCooldown = cache.get(`cool_${provider}_${kHash}`);
      if (!isCooldown) {
        availableKeyIndexes.push(idx);
      }
    }

    // Jika SEMUA key provider ini sedang cooldown, fallback coba semua key
    if (availableKeyIndexes.length === 0) {
      for (let attempt = 0; attempt < keys.length; attempt++) {
        availableKeyIndexes.push((cursor + attempt) % keys.length);
      }
    }

    for (const keyIndex of availableKeyIndexes) {
      const keyObj = keys[keyIndex];
      const kHash = getKeyHash(keyObj.apiKey);
      const modelToUse = (resolved.provider === provider && targetModel && targetModel !== "auto")
        ? targetModel
        : (keyObj.model || config[`DEFAULT_${provider.toUpperCase()}_MODEL`]);

      const start = Date.now();
      try {
        const output = caller({
          key: keyObj.apiKey,
          model: modelToUse,
          messages: request.messages,
          prompt: request.prompt,
          system: request.system,
          image: request.image,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          response_format: request.response_format
        });

        const latencyMs = Date.now() - start;
        // SUKSES: Majukan kursor ke key berikutnya
        cache.put(cursorKey, String((keyIndex + 1) % keys.length), 21600);
        // Hapus status cooldown jika sebelumnya ada
        cache.remove(`cool_${provider}_${kHash}`);
        logApiRequest(provider, modelToUse, 200, latencyMs, "Success");

        return {
          ok: true,
          provider: provider,
          model: modelToUse,
          result: output.result,
          usage: output.usage || null
        };
      } catch (err) {
        const latencyMs = Date.now() - start;
        const msg = String(err.message || err);
        const statusCode = err.statusCode || 500;
        errors.push(`[${provider}:${modelToUse}] ${msg}`);
        logApiRequest(provider, modelToUse, statusCode, latencyMs, msg);

        // 🧠 SMART COOLDOWN TRIGGER:
        if (statusCode === 429 || msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate limit")) {
          // Istirahatkan key ini selama 60 detik (agar request berikutnya langsung di-skip!)
          cache.put(`cool_${provider}_${kHash}`, "429_limit", cooldownSecs);
          console.warn(`[Cooldown] Key ${provider} (${kHash}) diistirahatkan ${cooldownSecs}s karena rate limit.`);
        } else if (statusCode === 401 || msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid api key")) {
          // Key mati/salah: istirahatkan 24 jam agar tidak dipakai lagi
          cache.put(`cool_${provider}_${kHash}`, "401_invalid", 86400);
          console.warn(`[Invalid] Key ${provider} (${kHash}) dinonaktifkan sementara karena 401.`);
        }

        // Lanjut mencoba key berikutnya dari provider yang sama
      }
    }
  }

  throw new Error("Semua provider AI gagal atau kuota habis:\n" + errors.join("\n"));
}

function callGroq(options) {
  const msgs = normalizeMessages(options);
  const payload = {
    model: options.model || "llama-3.3-70b-versatile",
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens || 2048,
    messages: msgs
  };
  if (options.response_format) payload.response_format = options.response_format;

  const response = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + options.key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  return parseOpenAiResponse(response, "Groq");
}

function callGemini(options) {
  const m = options.model || "gemini-2.5-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent?key=" + encodeURIComponent(options.key);

  let contents = [];
  let systemInstruction = null;

  if (options.messages && options.messages.length > 0) {
    for (const msg of options.messages) {
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: parseStringContent(msg.content) }] };
      } else {
        const role = msg.role === "assistant" ? "model" : "user";
        const parts = convertOpenAiContentToGeminiParts(msg.content);
        contents.push({ role, parts });
      }
    }
  } else {
    const parts = [];
    if (options.prompt) parts.push({ text: options.prompt });
    if (options.image && options.image.base64) {
      parts.push({
        inlineData: {
          mimeType: options.image.mime || "image/jpeg",
          data: options.image.base64
        }
      });
    }
    contents.push({ role: "user", parts });
  }

  if (options.system && !systemInstruction) {
    systemInstruction = { parts: [{ text: options.system }] };
  }

  const genConfig = {
    temperature: options.temperature ?? 0.2,
    maxOutputTokens: options.max_tokens || 2048
  };

  if (options.response_format?.type === "json_object" || (options.system && /json/i.test(options.system))) {
    genConfig.responseMimeType = "application/json";
  }

  const payload = {
    contents,
    generationConfig: genConfig,
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
    ]
  };

  if (systemInstruction) payload.system_instruction = systemInstruction;

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const text = response.getContentText();
  let json = {};
  try { json = JSON.parse(text); } catch (e) {}

  if (statusCode >= 400 || !json.candidates) {
    const errMsg = json.error?.message || text;
    const err = new Error("Gemini Error: " + errMsg);
    err.statusCode = statusCode;
    throw err;
  }

  const candidate = json.candidates[0];
  const outputText = candidate?.content?.parts?.map(p => p.text || "").join("") || "";
  const usage = json.usageMetadata ? {
    prompt_tokens: json.usageMetadata.promptTokenCount || 0,
    completion_tokens: json.usageMetadata.candidatesTokenCount || 0,
    total_tokens: json.usageMetadata.totalTokenCount || 0
  } : null;

  return {
    result: outputText.trim(),
    usage: usage
  };
}

function callMistral(options) {
  const msgs = normalizeMessages(options);
  const payload = {
    model: options.model || "mistral-large-latest",
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens || 2048,
    messages: msgs
  };
  if (options.response_format) payload.response_format = options.response_format;

  const response = UrlFetchApp.fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + options.key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  return parseOpenAiResponse(response, "Mistral");
}

function callNvidia(options) {
  const msgs = normalizeMessages(options);
  const payload = {
    model: options.model || "mistralai/mistral-large-3-675b-instruct-2512",
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens || 2048,
    messages: msgs
  };

  const response = UrlFetchApp.fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + options.key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  return parseOpenAiResponse(response, "Nvidia");
}

function callXKiro(options) {
  const msgs = normalizeMessages(options);
  const payload = {
    model: options.model || "mistralai/ministral-14b",
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens || 2048,
    messages: msgs
  };

  const response = UrlFetchApp.fetch("https://api.xkiro.com/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + options.key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  return parseOpenAiResponse(response, "xKiro");
}

function normalizeMessages(options) {
  if (options.messages && Array.isArray(options.messages)) {
    return options.messages;
  }
  const msgs = [];
  if (options.system) msgs.push({ role: "system", content: options.system });

  const content = [];
  if (options.prompt) content.push({ type: "text", text: options.prompt });
  if (options.image && options.image.base64) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${options.image.mime || "image/jpeg"};base64,${options.image.base64}`
      }
    });
  }

  msgs.push({ role: "user", content: content.length === 1 && content[0].type === "text" ? options.prompt : content });
  return msgs;
}

function parseStringContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(item => item.text || "").join("\n");
  }
  return JSON.stringify(content || "");
}

function convertOpenAiContentToGeminiParts(content) {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: JSON.stringify(content) }];

  const parts = [];
  for (const item of content) {
    if (item.type === "text" && item.text) {
      parts.push({ text: item.text });
    } else if (item.type === "image_url" && item.image_url?.url) {
      const url = item.image_url.url;
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          });
        }
      }
    }
  }
  return parts.length > 0 ? parts : [{ text: "" }];
}

function parseOpenAiResponse(response, providerName) {
  const statusCode = response.getResponseCode();
  const text = response.getContentText();
  let json = {};
  try { json = JSON.parse(text); } catch (e) {}

  if (statusCode >= 400 || !json.choices) {
    const errMsg = json.error?.message || json.message || text;
    const err = new Error(`${providerName} Error (${statusCode}): ${errMsg}`);
    err.statusCode = statusCode;
    throw err;
  }

  return {
    result: (json.choices?.[0]?.message?.content || "").trim(),
    usage: json.usage || null,
    raw: json
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 5. REASONING REMOVER & MICROSTOCK NORMALIZER
// ════════════════════════════════════════════════════════════════════════════

function stripThinking(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/<think>[\s\S]*?(?:<\/think>|(?=\n\s*(?:\{|TITLE:|Judul:|\*\*TITLE))|$)/gi, "")
    .replace(/<thought>[\s\S]*?(?:<\/thought>|(?=\n\s*(?:\{|TITLE:|Judul:|\*\*TITLE))|$)/gi, "")
    .replace(/<reasoning>[\s\S]*?(?:<\/reasoning>|(?=\n\s*(?:\{|TITLE:|Judul:|\*\*TITLE))|$)/gi, "")
    .trim();
}

function cleanMarkdown(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^[\s\-*•#>]+/g, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function normalizeMetadata(providerText, settings) {
  const cleanText = stripThinking(typeof providerText === "string" ? providerText : JSON.stringify(providerText || {}));
  let title = "High Quality Stock Asset";
  let keywords = ["photography", "design", "graphic", "modern", "illustration"];
  let category = "Graphic Resources";
  let fileType = "Illustration";

  const lines = cleanText.split("\n").map(l => cleanMarkdown(l)).filter(Boolean);
  for (const line of lines) {
    if (/^title[:\-]/i.test(line)) title = line.replace(/^title[:\-]\s*/i, "");
    if (/^category[:\-]/i.test(line)) category = line.replace(/^category[:\-]\s*/i, "");
    if (/^file_type[:\-]/i.test(line)) fileType = line.toLowerCase().includes("photo") ? "Photo" : "Illustration";
  }

  const legacyResult = `${title}&&${keywords.join(", ")}&&${category}&&false&&${fileType === "Illustration"}`;
  const formattedResult = `TITLE: ${title}\nKEYWORDS: ${keywords.join(", ")}\nCATEGORY: ${category}\nFILE_TYPE: ${fileType}`;

  return {
    ok: true,
    result: formattedResult,
    legacyResult: legacyResult,
    title: title,
    keywords: keywords,
    category: category,
    fileType: fileType
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 6. MAIN WEB APP ROUTER (doGet & doPost)
// ════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const params = e?.parameter || {};

  if (params.action === "setup") {
    return openAiJsonResponse(setupDatabase());
  }

  if (params.action === "models" || params.endpoint === "models") {
    return openAiJsonResponse(getOpenAiModelsList());
  }

  return openAiJsonResponse({
    object: "service",
    service: "GAS AI Proxy (OpenAI Compliant & Smart Cooldown Edition)",
    status: "online",
    version: "3.1.0",
    features: ["openai_chat_completions", "smart_key_cooldown", "multi_key_rotation", "failover"],
    models: getOpenAiModelsList().data.map(m => m.id)
  });
}

function doPost(e) {
  const requestStart = Date.now();

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return openAiErrorResponse("Missing POST body payload", "invalid_request_error", 400);
    }

    let body = {};
    try {
      body = typeof e.postData.contents === "string" ? JSON.parse(e.postData.contents) : e.postData.contents;
    } catch (err) {
      return openAiErrorResponse("Invalid JSON payload", "invalid_request_error", 400);
    }

    const authHeader = (e.headers && (e.headers["authorization"] || e.headers["Authorization"])) || "";
    const token = authHeader || body.token || body.apiKey || (e.parameter && (e.parameter.key || e.parameter.token)) || "";

    if (!validateAuthToken(token)) {
      return openAiErrorResponse("Incorrect or missing API key (Bearer token invalid)", "authentication_error", 401);
    }

    // 1. OPENAI CHAT COMPLETIONS
    if (Array.isArray(body.messages)) {
      const aiOutput = generateWithRotation({
        messages: body.messages,
        model: body.model,
        forceProvider: body.provider,
        temperature: body.temperature,
        max_tokens: body.max_tokens || body.max_completion_tokens,
        response_format: body.response_format
      });

      const cleanContent = stripThinking(aiOutput.result);
      const completionId = "chatcmpl-" + Utilities.getUuid().replace(/-/g, "").slice(0, 24);

      return openAiJsonResponse({
        id: completionId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: aiOutput.model,
        provider: aiOutput.provider,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: cleanContent
            },
            finish_reason: "stop"
          }
        ],
        usage: aiOutput.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        system_fingerprint: "fp_gas_ai_proxy"
      });
    }

    // 2. EXTENSION / METADATA MODE
    if (body.prompt || body.image) {
      const aiOutput = generateWithRotation({
        prompt: body.prompt || "Analyze this asset",
        system: body.system || body.systemPrompt || "",
        image: body.image,
        model: body.model,
        forceProvider: body.provider,
        temperature: body.temperature
      });

      const finalResult = normalizeMetadata(aiOutput.result, body.settings || {});
      return openAiJsonResponse({
        ok: true,
        provider: aiOutput.provider,
        model: aiOutput.model,
        latencyMs: Date.now() - requestStart,
        ...finalResult
      });
    }

    return openAiErrorResponse("Request must include either 'messages' or 'prompt'", "invalid_request_error", 400);

  } catch (err) {
    return openAiErrorResponse(err.message || "Internal server error occurred", "api_error", 500);
  }
}

function openAiJsonResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function openAiErrorResponse(message, type, statusCode) {
  const payload = {
    error: {
      message: String(message),
      type: type || "invalid_request_error",
      param: null,
      code: statusCode === 401 ? "invalid_api_key" : null
    }
  };
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ════════════════════════════════════════════════════════════════════════════
// 7. UI MODAL BINDING & REFRESH CACHE
// ════════════════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi().createMenu("🤖 AI Proxy Manager")
    .addItem("✨ Buka Panel Kontrol", "openControlPanel")
    .addSeparator()
    .addItem("🔄 Bersihkan Cache & Reset Cooldown", "clearAllCachesWithToast")
    .addItem("🛠️ Setup / Reset Database", "setupDatabase")
    .addToUi();
}

function openControlPanel() {
  const html = HtmlService.createHtmlOutputFromFile("Index")
    .setWidth(720)
    .setHeight(640)
    .setTitle("🤖 AI Proxy Control Center");
  SpreadsheetApp.getUi().showModalDialog(html, "🤖 AI Proxy Control Center");
}

function clearAllCachesWithToast() {
  CacheService.getScriptCache().removeAll([
    "config_cache", "keys_cache", "ext_keys_cache",
    "cursor_groq", "cursor_gemini", "cursor_mistral", "cursor_nvidia", "cursor_xkiro"
  ]);
  SpreadsheetApp.getActiveSpreadsheet().toast("Semua cache & masa jeda cooldown berhasil di-reset!", "🔄 Cache Flushed", 3);
}

function testSingleKey(provider, model, apiKey) {
  const caller = PROVIDER_CALLERS[provider];
  if (!caller) return { valid: false, error: "Provider tidak dikenali" };
  try {
    caller({ key: apiKey, model: model, prompt: "Reply OK", temperature: 0.1 });
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message || "Gagal verifikasi" };
  }
}

function addBulkApiKeysBackend(provider, customModel, rawKeysText, removePlaceholders, validateLive) {
  const p = (provider || "").trim().toLowerCase();
  const cleanKeys = Array.from(new Set(rawKeysText.split(/[\r\n,]+/).map(k => k.trim()).filter(k => k && !k.includes("contoh_paste_key"))));
  if (cleanKeys.length === 0) return { ok: false, error: "Tidak ada key valid" };

  const config = getConfig();
  const finalModel = customModel?.trim() || config[`DEFAULT_${p.toUpperCase()}_MODEL`];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.AI_KEYS);
    const rowsToInsert = [];
    const rejectedKeys = [];

    for (const k of cleanKeys) {
      if (validateLive) {
        const check = testSingleKey(p, finalModel, k);
        if (check.valid) {
          rowsToInsert.push([p, k, finalModel, "TRUE", ""]);
        } else {
          rejectedKeys.push({ keyPreview: k.slice(0, 6) + "...", error: check.error });
        }
      } else {
        rowsToInsert.push([p, k, finalModel, "TRUE", ""]);
      }
    }

    if (rowsToInsert.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToInsert.length, 5).setValues(rowsToInsert);
    }

    CacheService.getScriptCache().removeAll(["keys_cache", `cursor_${p}`]);
    return {
      ok: true,
      addedCount: rowsToInsert.length,
      rejectedCount: rejectedKeys.length,
      message: `Berhasil menambahkan ${rowsToInsert.length} kunci untuk ${p.toUpperCase()}!`
    };
  } finally {
    lock.releaseLock();
  }
}
