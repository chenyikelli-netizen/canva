# Brand Sentinel — 通用品牌輿情監控系統工程復原手冊

> **版本**：v3.0  
> **最後更新**：2026-04-15  
> **手冊定位**：工程級復原手冊。任何未有前置脈絡的工程師或 AI，皆可依此文件從零獨立部署、適配任意追蹤品牌，並產出一致品質的報告。  
> **Repository**：`https://github.com/chenyikelli-netizen/canva`  
> **（參考實作）當前追蹤目標**：Canva 品牌輿情

---

## 一、框架定義

### 這個系統在解決什麼問題？

**Brand Sentinel** 是一套可適配任意品牌的**全自動每日輿情監控框架**，解決以下問題：

- 手動追蹤品牌討論耗時、覆蓋不完整
- 散落在 Dcard、Threads、新聞、LinkedIn 等多平台的資訊無法整合
- 缺乏系統性的情緒趨勢與競品對比分析
- 報告格式不一致，難以跨日期橫向比較

### 系統的五個核心職能

```
蒐集 → 分析 → 報告 → 備份 → 通知
```

| 職能 | 目標 | 輸出物 |
|------|------|--------|
| 蒐集 | 從多平台自動取得品牌相關內容 | 結構化原始資料（JSON） |
| 分析 | LLM 為每筆資料標記情緒與主題 | 分析結果（寫入資料庫） |
| 報告 | 彙整成每日戰報與視覺面板 | `.md` 日報 + `.html` Pro Max 面板 |
| 備份 | 持久化報告與資料到 GitHub | Git 提交記錄 |
| 通知 | 推送報告連結至即時通訊 | LINE / Telegram 訊息 |

### 架構應用層

```
┌──────────────────────────────────────────────────┐
│                   設定層（單一入口）               │
│               src/config.js                       │
│   品牌名稱 / 關鍵字 / 競品 / 主題標籤 / 排程      │
└──────────────────┬───────────────────────────────┘
                   │ 驅動
    ┌──────────────┼──────────────────┐
    ▼              ▼                  ▼
蒐集層         分析層             報告層
collectors/   analyzer/          reporter/
    │              │                  │
    └──────────────┼──────────────────┘
                   ▼
             utils/db.js（SQLite）
                   │
    ┌──────────────┴──────────────┐
    ▼                             ▼
notifier/                  GitHub（備份）
LINE + Telegram
```

> 💡 **設計原則**：所有品牌特定的參數集中在 `src/config.js` 這一個檔案。換品牌時，理論上只需改這個檔案，但實務上仍有幾處硬字串需要一起更新（見第五節）。

---

## 二、首次部署流程

### 環境前置需求

- **Node.js** v20 或以上
- **Git** 已安裝並設定使用者名稱與 email
- **作業系統**：Windows（排程腳本為 `.bat` 格式；Unix 系統需改寫）

### 步驟 1 — 取得程式碼

```bash
git clone https://github.com/chenyikelli-netizen/canva.git
cd canva
npm install
```

### 步驟 2 — 設定環境變數

```bash
copy .env.example .env
# 用文字編輯器開啟 .env 填入所有金鑰
```

| 變數名 | 用途 | 取得方式 |
|--------|------|----------|
| `GEMINI_API_KEY` | LLM 分析引擎 | [Google AI Studio](https://aistudio.google.com/) → 建立 API Key |
| `TAVILY_API_KEY` | 網路搜尋蒐集 | [Tavily 官網](https://tavily.com/) → 免費方案足夠使用 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot 推送 | LINE Developers → 建立 Messaging API Channel |
| `LINE_CHANNEL_SECRET` | LINE Bot 驗證 | 同上 |
| `LINE_USER_ID` | 推送目標用戶 ID | 從 LINE Webhook Event 的 `source.userId` 取得 |
| `TELEGRAM_BOT_TOKEN` | Telegram 推送 | 與 @BotFather 對話建立 Bot |
| `TELEGRAM_CHAT_ID` | 推送目標頻道 | 執行 `node get_telegram_id.js` |
| `APIFY_TOKEN` | 備用爬蟲 MCP | [Apify Console](https://console.apify.com/) |

### 步驟 3 — 逐一驗證各模組

依序執行，確認每步都出現 `✅` 再繼續：

```bash
npm run test:collect    # 蒐集器驗證（會實際打 API）
npm run test:analyze    # 分析器驗證（需要 DB 中已有資料）
npm run test:report     # 報告生成驗證
npm run test:line       # LINE 推送驗證（會發送測試訊息）
npm run test:telegram   # Telegram 推送驗證
```

### 步驟 4 — 首次推送至 GitHub

> ⚠️ **此腳本只執行一次**，包含 `git init` 與 `remote add`，重複執行會衝突

```bash
push_git.bat
```

### 步驟 5 — 設定自動化排程

```bash
node install_backup_task.js   # 每日 02:00 自動備份資料至 GitHub
node install_task.js          # 每日 09:00 自動執行完整監控流程
```

---

## 三、適配新品牌——完整步驟

> 以下示範將系統從追蹤 **Canva** 改為追蹤 **Notion** 的完整流程。  
> 同樣步驟適用於任何品牌（替換品牌名詞即可）。

### 步驟 A — 更新 `src/config.js`（主設定，必做）

這是唯一的設定入口，改完後蒐集器、LLM 分析、主題分類都會自動套用。

```js
// 修改前（Canva）
primary_brand: 'Canva',
keywords: ['Canva', 'canva.com', 'Canva AI', 'Canva 設計'],
competitors: [
  { name: 'Figma', keywords: ['Figma', 'Figma AI'] },
  { name: 'Adobe Express', keywords: ['Adobe Express', 'Adobe Firefly'] }
],
topic_categories: ['產品功能', '定價與方案', '使用者體驗', '競品比較', '品牌形象', 'AI 相關', '教育與企業', '市場動態'],

// 修改後（以 Notion 為例）
primary_brand: 'Notion',
keywords: ['Notion', 'notion.so', 'Notion AI', 'Notion 筆記'],
competitors: [
  { name: 'Obsidian', keywords: ['Obsidian', 'Obsidian 插件'] },
  { name: 'Evernote', keywords: ['Evernote', '印象筆記'] }
],
topic_categories: ['筆記功能', '定價與方案', '使用者體驗', '競品比較', '品牌形象', 'AI 相關', '協作與企業', '市場動態'],
```

同時更新國際搜尋查詢：

```js
international_queries: [
  'Notion enterprise teams site:linkedin.com',
  'Notion AI productivity site:twitter.com',
  'Notion vs Obsidian site:linkedin.com',
  // ... 依品牌調整
],
```

### 步驟 B — 更新分析 Prompt 中的硬字串（必做）

`src/analyzer/prompt_templates.js` 第 80 行附近有硬寫的 Canva 服務對象描述：

```js
// 修改前
return `你是一位品牌策略分析師，服務對象是 Canva 的股東。`

// 修改後（以 Notion 為例）
return `你是一位品牌策略分析師，服務對象是 Notion 的股東。`
```

> 第 28 行的 `build_analysis_prompt` 已透過 `config.js` 動態讀取品牌名稱，**不需要手動改**。

### 步驟 C — 更新日報標題硬字串（必做）

`src/reporter/daily_report.js` 第 84 行：

```js
// 修改前
const banner = `# 📊 Canva Brand Sentinel 每日戰報`

// 修改後（以 Notion 為例）
const banner = `# 📊 Notion Brand Sentinel 每日戰報`
```

### 步驟 D — 更新 Obsidian 備份路徑（依需要修改）

`src/index.js` 第 170 行：

```js
// 修改前
const obsidian_dir = 'C:\\obsidian\\canva';
const file_name = `${today} Canva輿情監視報告.md`;

// 修改後
const obsidian_dir = 'C:\\obsidian\\notion';
const file_name = `${today} Notion輿情監視報告.md`;
```

### 步驟 E — 更新 Tavily 蒐集器的搜尋查詢（必做）

`src/collectors/tavily_collector.js` 第 26 行附近有硬寫的搜尋語句：

```js
// 修改前
const canva_queries = [
  'Canva 評價 PTT Dcard',
  'Canva 新功能 介紹',
  'Canva pro 升級 費用',
  'Canva AI 使用 心得'
];

// 修改後（以 Notion 為例）
const canva_queries = [   // 變數名可保留或同步更改
  'Notion 評價 PTT Dcard',
  'Notion 新功能 介紹',
  'Notion pro 升級 費用',
  'Notion AI 使用 心得'
];
```

同樣更新 A2 階段（第 41 行附近）：

```js
const google_review_queries = [
  'Notion 評價 心得 推薦',
  'Notion Pro 值得嗎 缺點',
  'Notion AI 筆記 使用者評論'
];
```

### 步驟 F — 手動執行一次驗證

```bash
npm run now   # 立即執行完整流程，確認新品牌資料蒐集、分析與報告都正常
```

---

## 四、每日標準執行流程

### 自動路徑（系統正常時）

```
09:00 (UTC+8) — node-cron 自動觸發
  │
  ├─ 鎖定檢查（.pipeline.lock）
  │     └─ 若今天已執行過 → 跳過（加 --force 可強制重跑）
  │
  ├─ Phase 1：資料蒐集（約 5–10 分鐘）
  │     ├─ TavilyCollector（A 本土 / A2 評論 / B 競品 / C 國際商務）
  │     ├─ DcardCollector
  │     └─ ThreadsCollector
  │
  ├─ Phase 2：LLM 分析（約 3–8 分鐘）
  │     ├─ 每批 10 筆送入 Gemini
  │     ├─ 輸出：品牌歸屬 + 主題 + 情緒 + 30 字摘要
  │     └─ 失敗項目自動排入重試佇列
  │
  ├─ Phase 3：報告生成
  │     ├─ Markdown 日報（純文字版）
  │     ├─ HTML Pro Max 視覺面板（Glassmorphism）
  │     └─ 觸發週報補償機制（若距上次週報 > 7 天）
  │
  ├─ Phase 4：備份同步
  │     ├─ 寫入 Obsidian（含 YAML frontmatter）
  │     ├─ 寫入 reports/ 目錄
  │     └─ 執行 backup_to_github.bat
  │
  └─ Phase 5：通知推送
        ├─ LINE Bot（主要）
        └─ Telegram Bot（備援 / 同時推送）

02:00 (UTC+8) — Windows 工作排程自動執行
  └─ backup_to_github.bat（備份資料庫與報告）
```

### 手動操作指令

```bash
npm run now                          # 立即執行完整流程（遵守鎖定）
node src/index.js --now --force      # 強制執行（忽略今日鎖定）
node send_latest_report.js           # 重送最新報告通知
node send_promax.js                  # 重送 Pro Max HTML 報告
```

---

## 五、資料規格

### Prompt 設計——LLM 輸入格式

每批 10 筆，格式如下：

```
[1]
平台: dcard
標題: 文章標題
內容: 前 500 字內文
品牌提示: Canva
```

### LLM 輸出規格（嚴格 JSON，不含任何額外字元）

```json
[
  {
    "index": 1,
    "brand": "主品牌名稱或競品名稱",
    "sentiment": "正面 | 中性 | 負面",
    "topic": "主題標籤（必須是 config.topic_categories 中之一）",
    "summary": "30 字以內繁體中文摘要"
  }
]
```

**關鍵約束**（違反會觸發修復機制）：
- 陣列長度必須等於輸入筆數
- `brand` 必須是 `config.js` 中定義的品牌之一
- 禁止在 JSON 外加任何文字、markdown 標記、或 code block 符號

### 洞察 Prompt 輸出規格

```json
{
  "insights": ["關鍵洞察1", "關鍵洞察2"],
  "competitor_analysis": ["競品觀察1"],
  "risks": ["風險警示1"]
}
```

---

## 六、報告品質驗收標準

### Markdown 日報（必有要素）

- [ ] 日期標示明確
- [ ] 情緒分布比例（正面 / 中性 / 負面 百分比 + 長條圖）
- [ ] 今日蒐集資料總筆數
- [ ] 品牌聲量市佔（各品牌筆數及情感佔比）
- [ ] 前 3 個熱門主題，各附一則代表性摘要
- [ ] AI 洞察（商業觀察 + 競品分析 + 風險預警）
- [ ] （週觸發日才有）週趨勢摘要區塊

### HTML Pro Max 面板（視覺標準）

- [ ] Glassmorphism 風格（半透明卡片 + 模糊背景）
- [ ] 情緒與主題的數值圖表（長條圖或圓餅圖）
- [ ] 手機瀏覽器友好（響應式佈局）
- [ ] **完全內聯 CSS**——不依賴任何外部 CDN，確保離線與任何環境均可渲染
- [ ] 所有互動元素有 hover 效果

### 報告公開網址格式

```
https://htmlpreview.github.io/?https://github.com/chenyikelli-netizen/canva/blob/main/reports/YYYY-MM-DD-canva-report-promax.html
```

> 若首次開啟空白，是 htmlpreview 代理快取延遲，等候 1–2 分鐘後重新整理即可。

---

## 七、Git 工作規範

### 三支腳本的使用時機

| 腳本 | 使用時機 | 包含範圍 | 注意 |
|------|----------|----------|------|
| `push_git.bat` | 🔴 首次初始化——**只用一次** | `git init` + 全部檔案 | 重複執行會衝突 |
| `backup_to_github.bat` | 🟢 每日自動資料備份 | `data/` + `reports/` + 少數設定檔 | 不含 `src/` 程式碼 |
| `save_git.bat` | 🔵 手動推送程式碼更新 | `git add .`（全部） | 每次推送程式碼修改後使用 |

### 常用指令

```bash
git log --oneline -10     # 查看最近 10 筆提交
git status                # 查看未提交的變動
git diff src/config.js    # 確認設定檔改了什麼
backup_to_github.bat      # 手動觸發資料備份
save_git.bat              # 推送程式碼更新
```

### .gitignore 核心規則

```gitignore
node_modules/              # 套件目錄（不版控）
.env                       # 金鑰（嚴禁上傳）
data/*.json                # 所有 JSON 資料預設忽略
!data/brand_sentinel.json  # 主資料庫為例外，必須追蹤
data/*.db                  # SQLite 二進位檔忽略
logs/                      # 機器日誌忽略
```

---

## 八、機制設計說明

### 防重複執行鎖定

```
執行時建立 .pipeline.lock，內容 = 今日日期 (YYYY-MM-DD)
同日再次執行 → 偵測到鎖定 → 立即跳過
跨日執行 → 日期不同 → 正常執行
加上 --force 參數 → 無視鎖定強制執行
```

### 週報補償機制

```
每次執行時呼叫 should_send_weekly()
  └─ 讀取資料庫中上次週報日期
  └─ 若距今超過 7 天 → 觸發週報
  └─ 週報資料合併進當日 Pro Max HTML
  └─ 寫入 DB 記錄，防止重複補發
```

目的：即使週一系統未啟動，下次啟動時自動補發，不需人工介入。

### LLM 失敗回收機制

```
LLM 整批失敗 → 所有資料標記 failed
LLM 部分遺漏 → 遺漏的資料標記 failed
下次執行時 → get_unanalyzed_data() 包含 failed 資料 → 重新送入
分析成功後 → clear_analysis_failure() 清除失敗記錄
```

---

## 九、故障排除速查

| 症狀 | 最可能原因 | 診斷指令 | 處理方式 |
|------|------------|----------|----------|
| 蒐集 0 筆資料 | API 金鑰失效或額度用盡 | `npm run test:collect` | 確認 Tavily/Apify token 有效 |
| LLM 分析批次失敗 | Gemini 輸出格式異常 | `npm run test:analyze` | 失敗資料自動重試，無需手動處理 |
| LINE 未收到訊息 | Token 或 User ID 錯誤 | `npm run test:line` | 重新確認 `.env` 中的 LINE 設定 |
| Telegram 未收到訊息 | Chat ID 錯誤 | `npm run test:telegram` | 執行 `node get_telegram_id.js` 重新取得 |
| GitHub push 失敗 (404) | Remote URL 或 PAT Token 過期 | `git remote -v` | 更新 GitHub Personal Access Token |
| HTML 報告空白 | htmlpreview 代理快取延遲 | 目測 GitHub 上的 `.html` 檔案是否已更新 | 等候 1–2 分鐘後重新整理 |
| 今天流程被跳過 | `.pipeline.lock` 鎖定 | `cat .pipeline.lock` 確認日期 | 加 `--force` 或刪除 `.pipeline.lock` |
| 資料庫損毀 | 異常中斷或磁碟問題 | 查看 `logs/` 目錄 | `node reset_db.js`（⚠️ **清空所有資料**） |

---

## 十、檔案結構完整對照

```
canva/  ← Repository 根目錄
│
├── src/
│   ├── index.js                     ★ 主入口：排程 + 五階段流程串接
│   ├── config.js                    ★ 品牌適配的唯一設定入口
│   │
│   ├── collectors/
│   │   ├── base_collector.js        基底類別（重試 / 格式化 / 防呆）
│   │   ├── tavily_collector.js      ✅ 主力蒐集器（A/A2/B/C 四階段）
│   │   ├── dcard_collector.js       ✅ Dcard 台灣社群
│   │   ├── threads_collector.js     ✅ Threads 社群平台
│   │   └── google_reviews_collector.js  ❌ 已停用（由 Tavily A2 取代）
│   │
│   ├── analyzer/
│   │   ├── analyzer.js              批次分析主控（每批 10 筆）
│   │   ├── llm_client.js            Gemini API 呼叫 + 多階段 JSON 修復
│   │   └── prompt_templates.js      ⚠️ 含少數硬字串（換品牌時需更新）
│   │
│   ├── reporter/
│   │   ├── daily_report.js          ⚠️ 含標題硬字串（換品牌時需更新）
│   │   ├── daily_report_promax.js   HTML Pro Max 視覺面板
│   │   └── weekly_report.js         週報（含補償邏輯）
│   │
│   ├── notifier/
│   │   ├── line_notifier.js         LINE Bot 推送
│   │   └── telegram_notifier.js     Telegram Bot 推送
│   │
│   └── utils/
│       ├── db.js                    SQLite 讀寫（insert / query / stats）
│       └── logger.js                Winston 結構化日誌
│
├── reports/                         報告輸出目錄（Git 追蹤）
├── data/brand_sentinel.json         主資料庫（Git 追蹤）
│
├── backup_to_github.bat             每日自動備份腳本
├── push_git.bat                     🔴 首次初始化（只用一次）
├── save_git.bat                     🔵 手動推送程式碼更新
├── install_backup_task.js           註冊 Windows 凌晨備份排程
├── install_task.js                  註冊 Windows 每日執行排程
│
├── .env                             金鑰（嚴禁上傳）
├── .env.example                     金鑰範本（Git 追蹤）
└── .gitignore                       版控過濾規則
```

---

## 附錄：換品牌快速清單

複製此清單，換品牌時逐項打勾：

```
□ src/config.js
    □ primary_brand
    □ keywords[]
    □ competitors[]（名稱 + 關鍵字）
    □ international_queries[]
    □ topic_categories[]（按品牌特性調整）

□ src/collectors/tavily_collector.js
    □ canva_queries[]（本土搜尋語句）
    □ google_review_queries[]（評論搜尋語句）

□ src/analyzer/prompt_templates.js
    □ build_insight_prompt 中的服務對象描述（第 80 行附近）

□ src/reporter/daily_report.js
    □ 報告標題（第 84 行附近的 `# 📊 Canva Brand Sentinel`）

□ src/index.js
    □ obsidian_dir 路徑（第 170 行附近）
    □ file_name 報告檔名（第 174 行附近）
    □ github_html_url（第 209 行附近）

□ 執行驗證
    □ npm run test:collect
    □ npm run now
    □ 確認報告品質符合第六節標準
```
