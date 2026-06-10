/***************************************************************
 * MedNote Organizer — Google Apps Script 後端 (Code.gs)
 *
 * 三層架構中的「後端」：負責 AI 整理、資料儲存（Google Sheets）。
 * 每位使用者部署自己獨立的一份，API Key 存於 Script Properties，
 * 絕不寫死在程式碼中。
 *
 * 部署方式：在一個 Google Sheet 中開啟「擴充功能 → Apps Script」，
 *          貼上本檔內容，再「部署 → 新增部署作業 → 網頁應用程式」。
 *          詳見 README.md。
 ***************************************************************/


/* =============================================================
 * 1. 分類設定（CATEGORY_CONFIG）
 *    ★ 這是唯一需要修改的地方 ★
 *    新增分類：在此物件加入一個新的 key（含 label 與 prompt）即可，
 *    其他邏輯（前端 UI、API）會自動套用，不需改動。
 * ============================================================= */
const CATEGORY_CONFIG = {

  ward_round: {
    label: '查房紀錄',
    prompt: '你是一位腎臟科主治醫師的助手，負責整理每日查房語音紀錄。\n'
      + '以下是查房語音轉錄的原始文字。請依病人分段，每位病人以 SOAP 格式條列：\n'
      + '\n'
      + '【病人識別】（床號、姓名或代號）\n'
      + 'S（Subjective）：病人主觀症狀、主訴、自述不適\n'
      + 'O（Objective）：生命徵象、體格檢查、今日相關檢驗數值（異常值標記 ⚠️）、影像判讀\n'
      + 'A（Assessment）：目前病況評估、與昨日或前次查房相比的變化（改善 ✅ / 惡化 ❌ / 持平）\n'
      + 'P（Plan）：\n'
      + '  - 藥物調整（新增、停用、劑量變更，請完整保留藥名與劑量）\n'
      + '  - 安排的檢驗或檢查項目\n'
      + '  - 其他處置或衛教\n'
      + '\n'
      + '注意事項：\n'
      + '- 若有多位病人，每人之間以分隔線（---）區隔\n'
      + '- 過濾填充詞、口誤、重複語句，但所有醫療資訊不得省略或自行推測\n'
      + '- 數值、藥名、劑量請完整保留，不得四捨五入或縮寫\n'
      + '輸出純文字，不要加任何前言或後記。'
  },

  admission: {
    label: '住院病程',
    prompt: '你是一位腎臟科主治醫師的助手，負責整理住院病程摘要。\n'
      + '以下是住院病程的語音轉錄。請依以下架構整理：\n'
      + '\n'
      + '【主要診斷與入院原因】\n'
      + '\n'
      + '【疾病發生與病程時序】\n'
      + '依時間先後條列，格式：[時間點或日期] 事件描述\n'
      + '重點涵蓋：\n'
      + '- 症狀首次出現的時間、部位、性質（如：疼痛的位置、性質、嚴重度 0-10 分）\n'
      + '- 症狀隨時間的演變（加重 ❌ / 緩解 ✅ / 波動）\n'
      + '- 伴隨症狀及其出現時序（如：發燒、水腫、喘、意識變化等）\n'
      + '- 重要檢驗數值的變化趨勢（標記異常值 ⚠️）\n'
      + '- 關鍵轉折點 🔑（如：病情突然惡化、診斷確立、轉入加護病房等）\n'
      + '\n'
      + '【曾接受的治療與處置】\n'
      + '條列曾給予的藥物（含劑量）、手術、透析、侵入性處置等，標註日期或時間點\n'
      + '\n'
      + '【目前病況與後續計畫】\n'
      + '現況評估 + 出院計畫或後續追蹤重點\n'
      + '\n'
      + '注意事項：\n'
      + '- 過濾稱呼語、重複確認、非醫療閒聊等會話雜訊\n'
      + '- 醫療數值、藥名、劑量完整保留，不得省略或推測\n'
      + '輸出純文字，不要加任何前言或後記。'
  },

  meeting: {
    label: '會議記錄',
    prompt: '你是一位行政助理，負責整理醫療團隊會議紀錄。\n'
      + '以下是會議的語音轉錄。請依以下架構整理：\n'
      + '\n'
      + '【會議重點】\n'
      + '以條列方式呈現（每點一行），涵蓋主要討論議題、共識與決議，標記重要決議 📌\n'
      + '\n'
      + '【待辦事項】\n'
      + '每項格式固定為：\n'
      + '【待辦】事項內容 | 負責人（若有提及，否則留空）| 時限（若有提及，否則留空）\n'
      + '\n'
      + '注意事項：\n'
      + '- 過濾閒聊、重複發言、無實質內容的確認語\n'
      + '- 待辦事項必須從內文中明確萃取，不得自行推測或捏造\n'
      + '- 若同一事項重複提及，只列一次\n'
      + '輸出純文字，不要加任何前言或後記。'
  },

  important_conversation: {
    label: '重要對話',
    prompt: '你是一位醫療助理，負責整理重要醫病或跨團隊對話的語音紀錄。\n'
      + '以下是對話的語音轉錄。請依以下架構整理：\n'
      + '\n'
      + '【對話背景】（簡述對話情境，如：病情說明、家屬溝通、跨科會診等）\n'
      + '\n'
      + '【各方立場與關切重點】\n'
      + '（若可辨識身分，標明：醫療方 / 病人 / 家屬 / 他科等）\n'
      + '\n'
      + '【關鍵決策與共識】\n'
      + '條列已達成的共識或決定\n'
      + '\n'
      + '【行動結論】\n'
      + '條列後續需要執行的事項\n'
      + '\n'
      + '注意事項：\n'
      + '- 去除填充詞、重複確認語、非實質內容\n'
      + '- 保留所有醫療資訊、數值、決策，不得省略或推測\n'
      + '輸出純文字，不要加任何前言或後記。'
  }

  // 日後新增分類：在此加入新的 key 與對應設定即可。
};


/* =============================================================
 * 2. 常數
 * ============================================================= */
const SHEET_RECORDS = 'records';
const SHEET_TODOS   = 'todos';
const SHEET_CONFIG  = 'config';

const RECORDS_HEADERS = ['id', 'timestamp', 'category', 'title', 'raw_text', 'processed_text', 'tags', 'status', 'created_by'];
const TODOS_HEADERS   = ['id', 'record_id', 'content', 'assignee', 'due_hint', 'done', 'created_at'];
const CONFIG_HEADERS  = ['key', 'value', 'updated_at'];

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash-lite';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';


/* =============================================================
 * 3. 進入點：doGet（桌面端查詢） / doPost（手機端送出）
 *
 *    CORS 說明：
 *    GAS 的 ContentService 無法自訂回應 header（.setHeader 不存在），
 *    因此本系統採「simple request」策略避開 CORS preflight：
 *      - GET 本身即為 simple request，可直接跨網域呼叫。
 *      - POST 由前端以 Content-Type: text/plain 送出（避免觸發
 *        preflight OPTIONS），後端再把 body 當 JSON 解析。
 *    這是 GAS Web App 對外提供 API 的標準可行作法。
 * ============================================================= */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (!checkToken(p.token)) return jsonOutput({ success: false, error: 'invalid token' });

    const action = p.action || 'list';
    switch (action) {
      case 'categories': return jsonOutput({ success: true, categories: listCategories() });
      case 'list':       return jsonOutput({ success: true, records: listRecords(p) });
      case 'get':        return jsonOutput({ success: true, record: getRecord(p.id) });
      case 'todos':      return jsonOutput({ success: true, todos: listTodos(p) });
      default:           return jsonOutput({ success: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return jsonOutput({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkToken(body.token)) return jsonOutput({ success: false, error: 'invalid token' });

    const action = body.action || 'submit';
    switch (action) {
      case 'submit':    return jsonOutput(handleSubmit(body));
      case 'update':    return jsonOutput(handleUpdate(body));
      case 'todo_done': return jsonOutput(handleTodoDone(body));
      default:          return jsonOutput({ success: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return jsonOutput({ success: false, error: String(err) });
  }
}


/* =============================================================
 * 4. 業務邏輯
 * ============================================================= */

/** 送出並整理：處理 + 立即儲存（即使 AI 失敗也不丟失原始資料） */
function handleSubmit(body) {
  const category = body.category;
  const cfg = CATEGORY_CONFIG[category];
  if (!cfg) return { success: false, error: 'unknown category: ' + category };

  const raw = (body.raw_text || '').trim();
  if (!raw) return { success: false, error: 'raw_text is empty' };

  const id = uuid();
  const ts = new Date().toISOString();

  let processed = '';
  let status = 'processed';
  try {
    processed = callAI(cfg.prompt, raw);
    if (!processed || !processed.trim()) {
      processed = raw;
      status = 'raw';           // AI 回傳空白 → 退回原始文字
    }
  } catch (err) {
    processed = raw;
    status = 'raw';             // AI 失敗 → 仍儲存原始文字（note #2）
  }

  const tags = Array.isArray(body.tags) ? body.tags.join(' ') : (body.tags || '');
  const sheet = getSheet(SHEET_RECORDS, RECORDS_HEADERS);
  sheet.appendRow([id, ts, category, body.title || '', raw, processed, tags, status, body.created_by || '']);

  // 會議類：額外萃取待辦事項
  if (category === 'meeting' && status === 'processed') {
    extractTodos(id, processed);
  }

  return { success: true, id: id, processed_text: processed, status: status };
}

/** 更新已存在紀錄的整理後文字 / 標題 / 標籤（供 PWA 的「確認儲存」保存編輯） */
function handleUpdate(body) {
  const id = body.id;
  if (!id) return { success: false, error: 'id is required' };

  const sheet = getSheet(SHEET_RECORDS, RECORDS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const col = headerIndex(RECORDS_HEADERS);

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][col.id]) === String(id)) {
      const rowNum = r + 1; // 1-based，含表頭
      if (body.processed_text !== undefined) sheet.getRange(rowNum, col.processed_text + 1).setValue(body.processed_text);
      if (body.title !== undefined)          sheet.getRange(rowNum, col.title + 1).setValue(body.title);
      if (body.tags !== undefined) {
        const t = Array.isArray(body.tags) ? body.tags.join(' ') : body.tags;
        sheet.getRange(rowNum, col.tags + 1).setValue(t);
      }
      return { success: true, id: id };
    }
  }
  return { success: false, error: 'record not found: ' + id };
}

/** 標記待辦完成 / 未完成 */
function handleTodoDone(body) {
  const id = body.id;
  if (!id) return { success: false, error: 'id is required' };
  const done = body.done === undefined ? true : !!body.done;

  const sheet = getSheet(SHEET_TODOS, TODOS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const col = headerIndex(TODOS_HEADERS);

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][col.id]) === String(id)) {
      sheet.getRange(r + 1, col.done + 1).setValue(done);
      return { success: true, id: id, done: done };
    }
  }
  return { success: false, error: 'todo not found: ' + id };
}

/** 從整理後文字中解析【待辦】行，寫入 todos sheet */
function extractTodos(recordId, text) {
  const sheet = getSheet(SHEET_TODOS, TODOS_HEADERS);
  const now = new Date().toISOString();
  const marker = '【待辦】';

  String(text).split('\n').forEach(function (line) {
    const idx = line.indexOf(marker);
    if (idx === -1) return;
    const rest = line.substring(idx + marker.length).trim();
    const parts = rest.split('|').map(function (s) { return s.trim(); });
    const content = parts[0] || '';
    if (!content) return;
    sheet.appendRow([uuid(), recordId, content, parts[1] || '', parts[2] || '', false, now]);
  });
}


/* =============================================================
 * 5. 查詢
 * ============================================================= */
function listCategories() {
  return Object.keys(CATEGORY_CONFIG).map(function (key) {
    return { key: key, label: CATEGORY_CONFIG[key].label };
  });
}

function listRecords(p) {
  const sheet = getSheet(SHEET_RECORDS, RECORDS_HEADERS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const category = p.category;
  const q = (p.q || '').toLowerCase();
  const limit = clampInt(p.limit, 20, 1, 200);
  const offset = clampInt(p.offset, 0, 0, 100000);

  let rows = data.slice(1).map(rowToRecord);

  rows = rows.filter(function (r) {
    if (category && category !== 'all' && r.category !== category) return false;
    if (q) {
      const hay = (r.title + ' ' + r.raw_text + ' ' + r.processed_text + ' ' + r.tags).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  rows.reverse(); // 最新在前
  return rows.slice(offset, offset + limit);
}

function getRecord(id) {
  if (!id) return null;
  const sheet = getSheet(SHEET_RECORDS, RECORDS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const col = headerIndex(RECORDS_HEADERS);
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][col.id]) === String(id)) return rowToRecord(data[r]);
  }
  return null;
}

function listTodos(p) {
  const sheet = getSheet(SHEET_TODOS, TODOS_HEADERS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const col = headerIndex(TODOS_HEADERS);
  const wantDone = p.done === undefined ? null : (String(p.done) === 'true');

  const rows = data.slice(1).map(function (row) {
    return {
      id: row[col.id],
      record_id: row[col.record_id],
      content: row[col.content],
      assignee: row[col.assignee],
      due_hint: row[col.due_hint],
      done: row[col.done] === true || String(row[col.done]).toLowerCase() === 'true',
      created_at: row[col.created_at]
    };
  });

  const filtered = (wantDone === null) ? rows : rows.filter(function (t) { return t.done === wantDone; });
  filtered.reverse();
  return filtered;
}


/* =============================================================
 * 6. AI Provider 抽象層
 * ============================================================= */
function callAI(prompt, text) {
  const provider = prop('AI_PROVIDER') || 'gemini';
  if (provider === 'claude') return callClaude(prompt, text);
  return callGemini(prompt, text);
}

function callGemini(prompt, text) {
  const apiKey = prop('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');
  const model = prop('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);

  const payload = {
    contents: [{ parts: [{ text: prompt + '\n\n----- 原始文字 -----\n' + text }] }],
    generationConfig: { temperature: 0.2 }
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const bodyText = res.getContentText();
  if (code !== 200) throw new Error('Gemini API ' + code + ': ' + bodyText);

  const json = JSON.parse(bodyText);
  const out = json
    && json.candidates && json.candidates[0]
    && json.candidates[0].content && json.candidates[0].content.parts
    && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
  return out || '';
}

function callClaude(prompt, text) {
  const apiKey = prop('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定');
  const model = prop('CLAUDE_MODEL') || DEFAULT_CLAUDE_MODEL;

  const payload = {
    model: model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt + '\n\n----- 原始文字 -----\n' + text }]
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const bodyText = res.getContentText();
  if (code !== 200) throw new Error('Claude API ' + code + ': ' + bodyText);

  const json = JSON.parse(bodyText);
  const out = json && json.content && json.content[0] && json.content[0].text;
  return out || '';
}


/* =============================================================
 * 7. 工具函式
 * ============================================================= */
function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken(token) {
  const expected = prop('APP_TOKEN');
  // 若尚未設定 APP_TOKEN，為避免完全鎖死，視為未啟用驗證（部署後請務必設定）。
  if (!expected) return true;
  return String(token) === String(expected);
}

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function uuid() {
  return Utilities.getUuid();
}

function headerIndex(headers) {
  const m = {};
  headers.forEach(function (h, i) { m[h] = i; });
  return m;
}

function rowToRecord(row) {
  const col = headerIndex(RECORDS_HEADERS);
  return {
    id: row[col.id],
    timestamp: row[col.timestamp],
    category: row[col.category],
    title: row[col.title],
    raw_text: row[col.raw_text],
    processed_text: row[col.processed_text],
    tags: row[col.tags],
    status: row[col.status],
    created_by: row[col.created_by]
  };
}

function clampInt(v, def, lo, hi) {
  let n = parseInt(v, 10);
  if (isNaN(n)) n = def;
  return Math.max(lo, Math.min(hi, n));
}

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到試算表：請從 Google Sheet 內建立此 Apps Script 專案');
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}


/* =============================================================
 * 8. 一次性初始化（部署後可在編輯器中手動執行一次）
 *    建立三個 Sheet 並寫入表頭。API Key 等敏感設定請改用
 *    「專案設定 → Script Properties」介面新增，勿寫死於程式碼。
 * ============================================================= */
function initSheets() {
  getSheet(SHEET_RECORDS, RECORDS_HEADERS);
  getSheet(SHEET_TODOS, TODOS_HEADERS);
  getSheet(SHEET_CONFIG, CONFIG_HEADERS);
  Logger.log('已建立 / 確認三個 Sheet：records, todos, config');
}
