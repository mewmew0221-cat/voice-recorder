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
  },

  idea_note: {
    label: '靈感筆記',
    prompt: '你是一位忠實的筆記助手，負責整理隨手記下的靈感與點子。\n'
      + '以下是語音轉錄的原始文字。請：\n'
      + '1. 以條列方式呈現，一個想法一行（若想法有層次，可用縮排表現）\n'
      + '2. 盡量保留輸入文本的原意與用字，不要過度改寫或潤飾\n'
      + '3. 去除語助詞、口吃、重複、口誤等雜訊\n'
      + '4. 不要替使用者延伸、補充或評論，也不要推測未說出口的內容\n'
      + '5. 若有多個不相干的點子，各自獨立成一條\n'
      + '輸出純文字，不要加任何前言或後記。'
  },

  text_note: {
    label: '文字筆記',
    prompt: '你是一位文字整理助手。以下是一段原始文字，請只做「最小幅度」的整理：\n'
      + '1. 僅修正明顯的語音轉錄錯誤、贅字、口吃與重複\n'
      + '2. 適當分段與斷行，讓格式清楚易讀\n'
      + '3. 嚴格保留原文的所有內容、用字、語氣與順序，不得改寫、摘要、增刪或重新組織\n'
      + '4. 不要加入任何標題、條列符號或評論\n'
      + '輸出整理後的純文字即可，不要加任何說明。'
  }

  // 日後新增分類：在此加入新的 key 與對應設定即可。
};


/* =============================================================
 * 2. 常數
 * ============================================================= */
const SHEET_RECORDS  = 'records';
const SHEET_TODOS    = 'todos';
const SHEET_CONFIG   = 'config';
const SHEET_PROMPTS  = 'prompts';
const SHEET_FEEDBACK = 'feedback';

const RECORDS_HEADERS = ['id', 'timestamp', 'category', 'title', 'raw_text', 'processed_text', 'tags', 'status', 'created_by'];
const TODOS_HEADERS   = ['id', 'record_id', 'content', 'assignee', 'due_hint', 'done', 'created_at'];
const CONFIG_HEADERS  = ['key', 'value', 'updated_at'];
// prompts：提示詞外部化。可直接在此 sheet 手動編輯，下次送出即生效。
//   category  分類 key（對應 CATEGORY_CONFIG）
//   label     顯示名稱（僅備註用，前端分類仍以程式碼為準）
//   version   版本號（同分類可有多版，取 active=TRUE 中 version 最大者）
//   prompt    提示詞內容（儲存格內用 Alt+Enter 換行）
//   active    TRUE = 啟用此版；同分類請只留一個 TRUE
//   updated_at / note  備註
const PROMPTS_HEADERS = ['category', 'label', 'version', 'prompt', 'active', 'updated_at', 'note'];
// feedback：優化素材。每筆紀錄首次被編輯時記下「AI 原稿 vs 人工修正」。
//   ai_output    第一次編輯前的內容（即 AI 原始產出，之後不再變動）
//   user_edited  目前最新的人工修正版（每次再編輯會更新）
//   edited_count 累計編輯次數
const FEEDBACK_HEADERS = ['id', 'record_id', 'category', 'ai_output', 'user_edited', 'edited_count', 'created_at', 'updated_at'];

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
      case 'feedback':   return jsonOutput({ success: true, feedback: listFeedback(p) });
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
      case 'submit':       return jsonOutput(handleSubmit(body));
      case 'update':       return jsonOutput(handleUpdate(body));
      case 'delete':       return jsonOutput(handleDelete(body));
      case 'todo_done':    return jsonOutput(handleTodoDone(body));
      case 'optimize':     return jsonOutput(handleOptimize(body));
      case 'apply_prompt': return jsonOutput(handleApplyPrompt(body));
      default:             return jsonOutput({ success: false, error: 'unknown action: ' + action });
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
    // 提示詞優先取自 prompts sheet 的 active 版本，沒有才用程式碼內建預設
    const promptText = getActivePrompt(category);
    processed = callAI(promptText, raw);
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
      if (body.processed_text !== undefined) {
        const oldText = String(data[r][col.processed_text] || '');
        const newText = String(body.processed_text);
        // 內容有變動才記錄回饋（AI 原稿 vs 人工修正），供日後優化提示詞
        if (newText !== oldText) {
          recordFeedback(id, String(data[r][col.category] || ''), oldText, newText);
        }
        sheet.getRange(rowNum, col.processed_text + 1).setValue(body.processed_text);
      }
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

/**
 * 記錄編輯回饋：首次編輯時 ai_output 存 AI 原稿，之後僅更新 user_edited 與次數。
 * 失敗不影響主流程（靜默）。
 */
function recordFeedback(recordId, category, aiOutput, userEdited) {
  try {
    const sheet = getSheet(SHEET_FEEDBACK, FEEDBACK_HEADERS);
    const data = sheet.getDataRange().getValues();
    const col = headerIndex(FEEDBACK_HEADERS);
    const now = new Date().toISOString();

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][col.record_id]) === String(recordId)) {
        const cnt = (parseInt(data[r][col.edited_count], 10) || 1) + 1;
        sheet.getRange(r + 1, col.user_edited + 1).setValue(userEdited);
        sheet.getRange(r + 1, col.edited_count + 1).setValue(cnt);
        sheet.getRange(r + 1, col.updated_at + 1).setValue(now);
        return;
      }
    }
    // 首次編輯：ai_output = 編輯前內容（即 AI 原始產出）
    sheet.appendRow([uuid(), recordId, category, aiOutput, userEdited, 1, now, now]);
  } catch (err) {
    // 靜默：回饋記錄失敗不應阻斷儲存
  }
}

/** 刪除一筆紀錄（連同其關聯的待辦事項） */
function handleDelete(body) {
  const id = body.id;
  if (!id) return { success: false, error: 'id is required' };

  const sheet = getSheet(SHEET_RECORDS, RECORDS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const col = headerIndex(RECORDS_HEADERS);

  let deleted = false;
  for (let r = data.length - 1; r >= 1; r--) { // 由下往上刪，避免列號位移
    if (String(data[r][col.id]) === String(id)) {
      sheet.deleteRow(r + 1); // 1-based，含表頭
      deleted = true;
      break;
    }
  }
  if (!deleted) return { success: false, error: 'record not found: ' + id };

  // 連帶刪除關聯的待辦
  const tSheet = getSheet(SHEET_TODOS, TODOS_HEADERS);
  const tData = tSheet.getDataRange().getValues();
  const tCol = headerIndex(TODOS_HEADERS);
  for (let r = tData.length - 1; r >= 1; r--) {
    if (String(tData[r][tCol.record_id]) === String(id)) {
      tSheet.deleteRow(r + 1);
    }
  }

  return { success: true, id: id };
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

/** 列出編輯回饋（優化素材）。可用 ?action=feedback&category=ward_round 篩選分類。 */
function listFeedback(p) {
  const sheet = getSheet(SHEET_FEEDBACK, FEEDBACK_HEADERS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const col = headerIndex(FEEDBACK_HEADERS);
  const category = p && p.category;

  const rows = data.slice(1).map(function (row) {
    return {
      id: row[col.id],
      record_id: row[col.record_id],
      category: row[col.category],
      ai_output: row[col.ai_output],
      user_edited: row[col.user_edited],
      edited_count: row[col.edited_count],
      created_at: row[col.created_at],
      updated_at: row[col.updated_at]
    };
  }).filter(function (f) {
    return !category || category === 'all' || f.category === category;
  });

  rows.reverse();
  return rows;
}


/* =============================================================
 * 5b. 提示詞來源（prompts sheet 優先，程式碼內建為後備）
 * ============================================================= */
/**
 * 取得某分類目前生效的提示詞。
 * 規則：prompts sheet 中該分類 active=TRUE 且 version 最大者；
 *       找不到（或內容空白）則回退至程式碼內建的 CATEGORY_CONFIG。
 */
function getActivePrompt(category) {
  try {
    const sheet = getSheet(SHEET_PROMPTS, PROMPTS_HEADERS);
    const data = sheet.getDataRange().getValues();
    const col = headerIndex(PROMPTS_HEADERS);
    let best = null;
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][col.category]) !== String(category)) continue;
      const activeVal = data[r][col.active];
      const active = activeVal === true || String(activeVal).toLowerCase() === 'true';
      if (!active) continue;
      const ver = parseInt(data[r][col.version], 10) || 0;
      const text = String(data[r][col.prompt] || '');
      if (text.trim() && (!best || ver > best.ver)) best = { ver: ver, prompt: text };
    }
    if (best) return best.prompt;
  } catch (err) {
    // 讀取失敗就靜默回退到內建預設
  }
  return CATEGORY_CONFIG[category] ? CATEGORY_CONFIG[category].prompt : '';
}


/* =============================================================
 * 5c. 提示詞優化（C1 半自動：AI 分析回饋 → 提議新版，人工審核後套用）
 * ============================================================= */

/** 分析該分類的編輯回饋，請 AI 提議改進版提示詞（不直接寫入，待人工審核） */
function handleOptimize(body) {
  const category = body.category;
  if (!category) return { success: false, error: 'category is required' };
  if (!CATEGORY_CONFIG[category]) return { success: false, error: 'unknown category: ' + category };

  const current = getActivePrompt(category);

  const all = listFeedback({ category: category });
  const samples = all.filter(function (f) {
    const a = String(f.ai_output || '').trim();
    const u = String(f.user_edited || '').trim();
    return a && u && a !== u;
  });
  if (samples.length === 0) {
    return { success: false, error: '此分類目前沒有可供分析的編輯回饋，請先累積一些編輯紀錄。' };
  }

  const use = samples.slice(0, 15); // 控制 token 用量
  let pairs = '';
  use.forEach(function (f, i) {
    pairs += '\n----- 範例 ' + (i + 1) + ' -----\n'
      + '[AI 原稿]\n' + f.ai_output + '\n\n'
      + '[醫師修正後]\n' + f.user_edited + '\n';
  });

  const meta =
    '你是一位提示詞工程專家，負責優化醫療文字整理系統的提示詞。\n'
    + '以下提供某分類「目前使用的提示詞」，以及多筆「AI 依此提示詞產出的原稿」與「醫師實際修正後版本」的對照。\n'
    + '請分析醫師反覆修改的模式（格式、用詞、保留或刪除的內容、結構等），找出 AI 系統性的不足，提出改進後的提示詞。\n\n'
    + '要求：\n'
    + '1. 只在必要處修改，保留原提示詞的整體結構與意圖\n'
    + '2. 著重「反覆出現」的模式，不要過擬合到個別案例\n'
    + '3. 嚴格依下列格式輸出，兩段都必須有：\n'
    + '===分析===\n（以條列說明你發現的模式與修改理由）\n'
    + '===新提示詞===\n（完整的新提示詞全文，可直接使用，不要加引號或程式碼框）\n\n'
    + '【目前的提示詞】\n' + current + '\n\n'
    + '【編輯對照，共 ' + use.length + ' 筆】' + pairs;

  let raw;
  try {
    raw = callAI(meta, '（請依上述對照進行分析並提出新提示詞）');
  } catch (err) {
    return { success: false, error: 'AI 呼叫失敗：' + String(err) };
  }

  const parsed = parseOptimizeOutput(raw);
  return {
    success: true,
    category: category,
    current_prompt: current,
    analysis: parsed.analysis,
    suggested_prompt: parsed.suggested,
    sample_count: use.length,
    total_feedback: samples.length
  };
}

/** 解析 meta-prompt 輸出的「分析」與「新提示詞」兩段 */
function parseOptimizeOutput(text) {
  const t = String(text || '');
  const pMark = t.indexOf('===新提示詞===');
  if (pMark !== -1) {
    const aMark = t.indexOf('===分析===');
    const analysis = aMark !== -1
      ? t.substring(aMark + '===分析==='.length, pMark).trim()
      : '';
    const suggested = t.substring(pMark + '===新提示詞==='.length).trim();
    return { analysis: analysis, suggested: suggested };
  }
  return { analysis: '', suggested: t.trim() }; // 解析失敗 → 全當新提示詞
}

/** 審核通過後套用：寫入 prompts sheet 成為新版本並 active，舊版自動停用 */
function handleApplyPrompt(body) {
  const category = body.category;
  const newPrompt = body.prompt;
  if (!category || !String(newPrompt || '').trim()) {
    return { success: false, error: 'category 與 prompt 為必填' };
  }

  const sheet = getSheet(SHEET_PROMPTS, PROMPTS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const col = headerIndex(PROMPTS_HEADERS);

  let maxVer = 0;
  let label = '';
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][col.category]) !== String(category)) continue;
    const ver = parseInt(data[r][col.version], 10) || 0;
    if (ver > maxVer) maxVer = ver;
    if (data[r][col.label]) label = data[r][col.label];
    const activeVal = data[r][col.active];
    const active = activeVal === true || String(activeVal).toLowerCase() === 'true';
    if (active) sheet.getRange(r + 1, col.active + 1).setValue(false); // 停用舊版
  }
  if (!label) label = (CATEGORY_CONFIG[category] && CATEGORY_CONFIG[category].label) || category;

  const now = new Date().toISOString();
  sheet.appendRow([category, label, maxVer + 1, newPrompt, true, now, body.note || 'C1 優化建議套用']);
  return { success: true, category: category, version: maxVer + 1 };
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
 *    建立各 Sheet 並寫入表頭。API Key 等敏感設定請改用
 *    「專案設定 → Script Properties」介面新增，勿寫死於程式碼。
 * ============================================================= */
function initSheets() {
  getSheet(SHEET_RECORDS, RECORDS_HEADERS);
  getSheet(SHEET_TODOS, TODOS_HEADERS);
  getSheet(SHEET_CONFIG, CONFIG_HEADERS);
  getSheet(SHEET_FEEDBACK, FEEDBACK_HEADERS);
  initPrompts();
  Logger.log('已建立 / 確認 Sheet：records, todos, config, prompts, feedback');
}

/**
 * 把程式碼內建的 CATEGORY_CONFIG 提示詞匯入 prompts sheet（version 1, active）。
 * 安全設計：已存在的分類「不覆蓋」，避免蓋掉你在 sheet 上手動改過的內容。
 * 之後新增分類時可再執行一次，只會補上缺少的。
 */
function initPrompts() {
  const sheet = getSheet(SHEET_PROMPTS, PROMPTS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const col = headerIndex(PROMPTS_HEADERS);

  const have = {};
  for (let r = 1; r < data.length; r++) have[String(data[r][col.category])] = true;

  const now = new Date().toISOString();
  let added = 0;
  Object.keys(CATEGORY_CONFIG).forEach(function (key) {
    if (have[key]) return; // 已存在 → 保留使用者版本，不動
    const c = CATEGORY_CONFIG[key];
    sheet.appendRow([key, c.label, 1, c.prompt, true, now, '由程式碼預設匯入']);
    added++;
  });
  Logger.log('initPrompts：新增 ' + added + ' 筆提示詞（已存在者保留不變）');
}
