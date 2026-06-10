# MedNote 部署說明

MedNote 是一套「醫療語音紀錄整理系統」。你把已經轉成文字的語音內容貼進手機 App，
系統會用 AI 自動整理成結構化的查房 / 病程 / 會議紀錄，存進你自己的 Google 試算表，
之後可以在電腦上查詢、搜尋。

> **重要：每個人部署自己獨立的一份。** 你的資料、API Key 都只在你自己的 Google 帳號裡，
> 不會跟任何人共用。院內資料不外傳。

---

## 你需要準備什麼（5 分鐘）

1. 一個 **Google 帳號**（用來建立試算表與後端）。
2. 一支 **AI API Key**（二選一）：
   - **Gemini**（推薦，免費額度足夠）：到 <https://aistudio.google.com/apikey> 點「Create API key」複製下來。
   - 或 **Claude**：到 <https://console.anthropic.com> 申請。
3. 本資料夾內的三個檔案：`gas/Code.gs`、`pwa/index.html`、`dashboard/index.html`。

---

## 第一步：建立 Google Sheet 後端

1. 打開 <https://sheets.google.com>，點左上角「**＋ 空白試算表**」建立一個新試算表。
2. 把它命名為「**MedNote 資料**」（名字隨意）。
3. 不需要自己建立任何欄位，系統第一次執行時會自動建立 `records`、`todos`、`config` 三個分頁。

---

## 第二步：部署 GAS（後端程式）

1. 在剛剛的試算表上方選單，點「**擴充功能 → Apps Script**」。會打開一個程式編輯器。
2. 把編輯器裡原本的 `function myFunction() {}` 全部刪掉。
3. 打開本資料夾的 `gas/Code.gs`，**全選、複製**，貼到編輯器裡，按 **Ctrl+S 存檔**。
4. （建立分頁）在編輯器上方，把要執行的函式選成 **`initSheets`**，點「**▷ 執行**」。
   - 第一次會跳出授權視窗：點「**檢閱權限**」→ 選你的 Google 帳號 →
     若出現「Google 尚未驗證這個應用程式」，點「**進階 → 前往（不安全）**」→「**允許**」。
     （這是你自己寫的程式，安全。）
   - 回到試算表會看到多出 `records`、`todos`、`config` 三個分頁，代表成功。
5. （正式部署）回到 Apps Script，點右上角藍色「**部署 → 新增部署作業**」：
   - 「**選取類型**」（齒輪圖示）選「**網頁應用程式**」。
   - 「**執行身分**」選「**我（你的信箱）**」。
   - 「**誰可以存取**」選「**任何人**」。
   - 點「**部署**」，複製產生的「**網頁應用程式 URL**」（長得像
     `https://script.google.com/macros/s/AKfyc.../exec`）。**這個 URL 等一下要用。**

> 之後若你修改了 `Code.gs`，要再點「**部署 → 管理部署作業 → ✏ 編輯 → 版本選「新版本」→ 部署**」才會生效。

---

## 第三步：設定 API Key

> 為了安全，API Key **不寫在程式碼裡**，而是存在 Apps Script 的「Script Properties」。

1. 在 Apps Script 編輯器，點左側齒輪「**專案設定**」。
2. 捲到最下方「**指令碼屬性（Script Properties）**」，點「**新增指令碼屬性**」，逐一加入下列項目：

   | 屬性（Property） | 值（Value） | 說明 |
   |---|---|---|
   | `APP_TOKEN` | 自訂一組密碼字串，例如 `mednote-彰化腎-2026` | 防止網址被別人亂用，等一下手機/電腦端要填一樣的 |
   | `AI_PROVIDER` | `gemini`（或 `claude`） | 要用哪家 AI |
   | `GEMINI_API_KEY` | 你的 Gemini Key | 用 Gemini 時填 |
   | `GEMINI_MODEL` | `gemini-2.0-flash-lite` | 可不填，預設就是這個 |
   | `ANTHROPIC_API_KEY` | 你的 Claude Key | 用 Claude 時才填 |
   | `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | 用 Claude 時可填 |

3. 按「**儲存指令碼屬性**」。

> 提醒：`APP_TOKEN` 一定要設，否則任何人拿到網址就能寫入你的資料。

---

## 第四步：安裝手機 App（PWA）

手機 App 是 `pwa/index.html`。要讓手機能打開它，需要先放到網路上（擇一）：

- **最簡單**：把整個 `pwa` 資料夾上傳到 **GitHub Pages**、**Netlify Drop**（<https://app.netlify.com/drop> 直接拖曳資料夾）或院內網頁伺服器，取得一個網址。
- 或放在你已有的內網伺服器。

接著用手機操作：

1. 用手機瀏覽器打開那個網址。
2. 第一次會自動跳出「**設定**」，填入：
   - **GAS Endpoint URL**：第二步複製的網頁應用程式 URL。
   - **APP Token**：第三步設定的 `APP_TOKEN`（要一模一樣）。
   - **AI Provider / Model**：選填，做備忘用（實際以 GAS 端設定為準）。
   - 按「**儲存設定**」。
3. 加到主畫面（變成像 App 一樣）：
   - **iPhone（Safari）**：點下方「分享」按鈕 → 「**加入主畫面**」。
   - **Android（Chrome）**：點右上角「⋮」→ 「**安裝應用程式 / 加到主畫面**」。

**怎麼用**：選分類（查房 / 住院病程 / 會議 / 重要對話）→ 貼上轉錄文字 → 按「**送出並整理**」。
稍候幾秒會出現整理結果，可直接在框內微調，按「**✓ 確認儲存**」保存編輯。
（即使 AI 整理失敗，原始文字也已經存起來，不會遺失。）

---

## 第五步：使用桌面查詢介面

桌面介面是 `dashboard/index.html`。

1. 直接用電腦瀏覽器打開這個檔案即可（雙擊開啟），或一起上傳到第四步的同一個網址。
2. 第一次會跳出設定，填入跟手機端**一樣**的 **GAS URL** 和 **APP Token**，按儲存。
3. 功能：
   - 左側「**分類篩選**」即時切換要看的類別。
   - 上方「**搜尋框**」可全文搜尋標題、內容、標籤。
   - 點每筆紀錄可展開看整理後內容。
   - 左下「**待辦事項**」會自動匯整「會議記錄」中萃取出的待辦，點左邊方框可標記完成。

---

## 常見問題

**Q：手機按送出後一直轉，或出現紅色錯誤線？**
- 多半是 **GAS URL 或 APP Token 填錯**。點右上角「⚙ 設定」重新確認，URL 結尾必須是 `/exec`。
- 確認第三步的 `APP_TOKEN` 與手機端填的完全一致（含大小寫、符號）。

**Q：出現「invalid token」？**
- 手機/電腦端的 APP Token 跟 GAS 端 `APP_TOKEN` 不一樣。改成一致即可。

**Q：出現「GEMINI_API_KEY 未設定」之類訊息？**
- 回第三步，確認 Script Properties 有正確填入對應的 API Key，且 `AI_PROVIDER` 與你填的 Key 相符
  （填 `gemini` 就要有 `GEMINI_API_KEY`；填 `claude` 就要有 `ANTHROPIC_API_KEY`）。

**Q：改了 `Code.gs` 但沒效果？**
- Apps Script 改完要重新「**管理部署作業 → 編輯 → 新版本 → 部署**」才會更新。

**Q：想新增一種分類（例如「門診紀錄」）？**
- 打開 `gas/Code.gs`，在最上方的 `CATEGORY_CONFIG` 物件裡，照現有格式加一組 `key / label / prompt` 即可，
  其他都不用改，手機和桌面端會自動出現新分類。改完記得重新部署新版本。

**Q：資料安全嗎？**
- 試算表、API Key 都在你自己的 Google 帳號內。請務必設定 `APP_TOKEN`，並只把網址給自己用。
