# Brand Sentinel — 通用品牌輿情監控系統工程手冊

> **版本**：v4.0
> **最後更新**：2026-04-17
> **Repository 參考實作**：`https://github.com/chenyikelli-netizen/canva`
> **手冊定位**：自包含工程手冊。任何未有前置脈絡的工程師或 AI，可依此文件獨立部署、適配任意追蹤品牌，並產出一致品質的報告。

---

## 一、系統框架

### 解決什麼問題？

**Brand Sentinel** 是一套可適配任意品牌的**全自動每日輿情監控框架**：

- 手動追蹤品牌討論耗時、覆蓋不完整
- 散落在 Dcard、Threads、新聞、LinkedIn 等多平台的資訊無法整合
- 缺乏系統性的情緒趨勢與競品對比分析
- 報告格式不一致，難以跨期橫向比較

### 五個核心職能

```
蒐集 → 分析 → 報告 → 備份 → 通知
```

| 職能 | 目標 | 輸出物 |
|------|------|--------|
| 蒐集 | 從多平台自動取得品牌相關內容 | 結構化原始資料（JSON） |
| 分析 | LLM 為每筆資料標記情緒與主題 | 分析結果（寫入 JSON 資料庫） |
| 報告 | 彙整成三層報告 | `.md` 日報 + `.html` Pro Max 視覺面板（含週/月報區塊） |
| 備份 | 持久化報告與資料到 GitHub | Git 提交記錄 |
| 通知 | 推送報告連結至即時通訊 | LINE / Telegram 訊息 |

### 架構應用層

```
┌──────────────────────────────────────────────┐
│              設定層（唯一入口）                │
│              src/config.js                    │
│  品牌名稱 / 關鍵字 / 競品 / 主題標籤 / 排程   │
└──────────────────┬───────────────────────────┘
                   │ 驅動
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
蒐集層         分析層          報告層
collectors/   analyzer/       reporter/
    │              │               │
    └──────────────┼───────────────┘
                   ▼
             utils/db.js（JSON 檔案資料庫）
                   │
    ┌──────────────┴──────────────┐
    ▼                             ▼
notifier/                  GitHub（備份）
LINE + Telegram
```

> 💡 **設計原則**：所有品牌特定參數集中在 `src/config.js` 一個檔案。換品牌理論上只改這一個，但還有 4 個硬字串位置需要同步（見第三節）。

---

## 二、三層報告架構

### 觸發說明

```
每日 10:00（台北時間）主流程執行
  ↓
① 日報（每天必有）

② 判斷週期性報告類型：
   距上次週/月報 < 7 天  ─→ 不觸發額外報告
   距上次 ≥ 7 天 AND 今日 + 7 天 ≤ 本月最後一天  ─→ 週報
   距上次 ≥ 7 天 AND 今日 + 7 天 > 本月最後一天  ─→ 月報（取代當月最後一次週報）
```

### 你每次收到的內容

| 當天觸發類型 | Pro Max HTML 面板包含 |
|-------------|----------------------|
| 一般日 | 日報（情緒矩陣 + 熱議主題 + AI 洞察 + 競品 + 風險）|
| 週報日 | 日報 + **週報區塊**（本週 vs 上週：聲量變化 / 情緒對比 / 主題排行）|
| 月報日 | 日報 + **月報區塊**（月度 KPI + 品牌聲量橫條圖 + 各週分段摘要）|

### 補償機制

- 若觸發日（如週日）電腦未開機 → 下次開機第一天自動補發
- 補發時依「當天日期」重新判斷發週報或月報
- DB 同時追蹤 `weekly` 和 `monthly` 兩種報告類型，取最近一筆作為 7 天計時基準

### 月份判斷邏輯（方案 B）

```
is_last_trigger_of_month(today):
  next_trigger = today + 7 天
  last_day     = 本月最後一天
  若 next_trigger > last_day → 發月報
```

**邊界範例（4 月共 30 天）：**

| 觸發日 | today+7 | 判斷 |
|--------|---------|------|
| 04-13 | 04-20 | 週報 |
| 04-20 | 04-27 | 週報 |
| 04-24 | 05-01 | **月報** |
| 04-27 | 05-04 | **月報** |

---

## 三、首次部署流程

### 環境前置需求

- **Node.js** v20 或以上
- **Git** 已安裝並設定 `user.name` 與 `user.email`
- **作業系統**：Windows（排程腳本為 `.bat` 格式）

### 步驟 1 — 取得程式碼

```bash
git clone https://github.com/chenyikelli-netizen/canva.git
cd canva
npm install
```

### 步驟 2 — 設定環境變數

```bash
copy .env.example .env
# 用文字編輯器填入所有金鑰
```

| 變數名 | 用途 | 取得方式 |
|--------|------|----------|
| `GEMINI_API_KEY` | LLM 分析引擎 | [Google AI Studio](https://aistudio.google.com/) |
| `TAVILY_API_KEY` | 網路搜尋蒐集 | [Tavily 官網](https://tavily.com/) 免費方案即可 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot 推送 | LINE Developers → Messaging API Channel |
| `LINE_CHANNEL_SECRET` | LINE Bot 驗證 | 同上 |
| `LINE_USER_ID` | 推送目標 | LINE Webhook Event 的 `source.userId` |
| `TELEGRAM_BOT_TOKEN` | Telegram 推送 | 與 @BotFather 對話 |
| `TELEGRAM_CHAT_ID` | 推送目標 | `node get_telegram_id.js` |
| `APIFY_TOKEN` | 備用爬蟲 | [Apify Console](https://console.apify.com/) |

### 步驟 3 — 逐一驗證

依序執行，每步確認出現 `✅` 再繼續：

```bash
npm run test:collect    # 蒐集器（會實際打 API）
npm run test:analyze    # 分析器（需 DB 中已有資料）
npm run test:report     # 報告生成
npm run test:line       # LINE 推送（發送測試訊息）
npm run test:telegram   # Telegram 推送
```

### 步驟 4 — 首次推送至 GitHub

> ⚠️ 此腳本只執行**一次**，包含 `git init` 與 `remote add`，重複執行會衝突

```bash
push_git.bat
```

### 步驟 5 — 設定自動排程

```bash
node install_backup_task.js   # 每日 02:00 自動備份至 GitHub
node install_task.js          # 每日 10:00 自動執行完整流程
```

> 排程實際執行的是 `run_now.bat` → `run.bat --now` → `node src/index.js --now`（立即執行並退出）

---

## 四、適配新品牌——完整步驟

> 以下示範從追蹤 **Canva** 改為追蹤 **Notion** 的完整流程。

### A — 更新 `src/config.js`（主設定，必做）

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

同時更新國際查詢：

```js
international_queries: [
  'Notion enterprise teams site:linkedin.com',
  'Notion AI productivity site:twitter.com',
  // ... 依品牌調整
],
```

### B — 更新 `src/analyzer/prompt_templates.js`（第 80 行附近）

```js
// 修改前
return `你是一位品牌策略分析師，服務對象是 Canva 的股東。`

// 修改後
return `你是一位品牌策略分析師，服務對象是 Notion 的股東。`
```

### C — 更新 `src/reporter/daily_report.js`（第 84 行附近）

```js
// 修改前
const banner = `# 📊 Canva Brand Sentinel 每日戰報`

// 修改後
const banner = `# 📊 Notion Brand Sentinel 每日戰報`
```

### D — 更新 `src/collectors/tavily_collector.js`（第 26 / 41 行附近）

```js
// 本土搜尋語句
const canva_queries = [    // 變數名可保留或同步更改
  'Notion 評價 PTT Dcard',
  'Notion 新功能 介紹',
  'Notion pro 升級 費用',
  'Notion AI 使用 心得'
];

// 評論搜尋語句
const google_review_queries = [
  'Notion 評價 心得 推薦',
  'Notion Pro 值得嗎 缺點',
  'Notion AI 筆記 使用者評論'
];
```

### E — 更新 `src/index.js`（第 170 行附近）

```js
const obsidian_dir = 'C:\\obsidian\\notion';
const file_name = `${today} Notion輿情監視報告.md`;
```

### F — 執行驗證

```bash
npm run test:collect
npm run now
# 確認報告品質符合第七節標準
```

---

## 五、每日執行時間表

```
10:00 (台北時間) — 主流程自動觸發（node src/index.js --now）
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
  │     └─ 失敗批次自動排入重試佇列（最多 3 次）
  │
  ├─ Phase 3：報告生成
  │     ├─ Markdown 日報（純文字版）
  │     ├─ 判斷週期性報告類型（每 7 天觸發一次，週報 or 月報）
  │     └─ HTML Pro Max 視覺面板（日報 + 週/月報區塊擇一嵌入）
  │
  ├─ Phase 4：備份同步
  │     ├─ 寫入 Obsidian（含 YAML frontmatter）
  │     ├─ 寫入 reports/ 目錄
  │     └─ 執行 backup_to_github.bat
  │
  └─ Phase 5：通知推送
        ├─ LINE Bot（主要），訊息標頭依日報/週報/月報差異化
        └─ Telegram Bot（備援）

02:00 (台北時間) — 深夜自動備份
  └─ backup_to_github.bat（備份 JSON 資料庫與 reports/）
```

---

## 六、手動操作指令

```bash
# 主流程
npm run now                          # 立即執行完整流程（遵守鎖定）
node src/index.js --now --force      # 強制執行（忽略今日鎖定）

# 補發報告
node src/send_latest_report.js       # 重送最新日報通知
node src/send_weekly_now.js          # 手動補發週報並推送
node src/send_monthly_now.js         # 手動補發月報並推送

# Git 操作
save_git.bat                         # 推送程式碼更新至 GitHub
backup_to_github.bat                 # 手動觸發資料備份
git log --oneline -10               # 查看最近 10 筆提交
git status                           # 查看未提交的變動
```

---

## 七、資料規格

### LLM 輸入格式（每批 10 筆）

```
[1]
平台: dcard
標題: 文章標題
內容: 前 500 字內文
品牌提示: Canva
```

### LLM 輸出規格（嚴格 JSON）

```json
[
  {
    "index": 1,
    "brand": "主品牌名稱或競品名稱",
    "sentiment": "正面 | 中性 | 負面",
    "topic": "必須是 config.topic_categories 中之一",
    "summary": "30 字以內繁體中文摘要"
  }
]
```

**關鍵約束：**
- 陣列長度必須等於輸入筆數
- `brand` 必須是 `config.js` 中定義的品牌之一
- 禁止在 JSON 外加任何文字、markdown 標記或 code block 符號（違反則觸發修復機制）

### AI 洞察輸出規格

```json
{
  "insights": ["關鍵洞察1", "關鍵洞察2"],
  "competitor_analysis": ["競品觀察1"],
  "risks": ["風險警示1"]
}
```

---

## 八、報告品質驗收標準

### Markdown 日報（必有要素）

- [ ] 日期標示明確
- [ ] 情緒分布比例（正面 / 中性 / 負面 百分比）
- [ ] 今日蒐集資料總筆數
- [ ] 品牌聲量市佔（各品牌筆數及情感佔比）
- [ ] 前 3 個熱門主題，各附一則代表性摘要
- [ ] AI 洞察（商業觀察 + 競品分析 + 風險預警）

### HTML Pro Max 面板（視覺標準）

- [ ] Dark Mode + Aurora Glassmorphism 風格（半透明卡片 + 模糊背景）
- [ ] 情緒與主題的進度條圖表
- [ ] 手機瀏覽器友好（響應式佈局）
- [ ] **完全內聯 CSS**——不依賴任何外部 CDN（確保離線可渲染）
- [ ] 所有卡片有 hover 動效
- [ ] **週報日額外**：本週 vs 上週聲量 / 情緒對比 + 主題排行
- [ ] **月報日額外**：月度 KPI 四格 + 品牌聲量橫條圖 + 各週分段摘要

### 報告公開網址格式

```
https://htmlpreview.github.io/?https://github.com/{user}/{repo}/blob/main/reports/{YYYY-MM-DD}-canva-report-promax.html
```

> 首次開啟空白屬正常現象（htmlpreview 代理快取延遲），等候 1–2 分鐘後重新整理即可。

---

## 九、Git 版本控制規範

### 三支腳本使用時機

| 腳本 | 使用時機 | 注意 |
|------|----------|------|
| `push_git.bat` | 🔴 首次初始化——**只用一次** | 包含 `git init`，重複執行會衝突 |
| `backup_to_github.bat` | 🟢 每日自動備份（data/ + reports/） | 不含 src/ 程式碼 |
| `save_git.bat` | 🔵 手動推送程式碼更新 | `git add .` 全部，每次改程式後用 |

### .gitignore 核心規則

```gitignore
node_modules/              # 套件目錄
.env                       # 金鑰（嚴禁上傳）
data/*.json                # 所有 JSON 資料預設忽略
!data/brand_sentinel.json  # 主資料庫為例外（必須追蹤）
data/*.db                  # SQLite 忽略
logs/                      # 機器日誌忽略
```

---

## 十、三個保護機制

### 防重複執行鎖定

```
執行時建立 .pipeline.lock，內容 = 今日日期（YYYY-MM-DD）
同日再次執行 → 偵測到鎖定 → 立即跳過
跨日執行 → 日期不同 → 正常執行
加上 --force 參數 → 無視鎖定強制執行
```

### 週期報告補償機制（週報 / 月報共用）

```
每次主流程執行時呼叫 should_send_periodic_report()
  └─ 查詢 DB 中最近一次週報或月報的發送日期
  └─ 若距今 ≥ 7 天 → 判斷類型（方案 B）→ 觸發對應報告
  └─ 儲存至 DB（report_type: 'weekly' 或 'monthly'），防止重複補發
```

### LLM 失敗回收機制

```
LLM 整批失敗 → 所有資料標記 failed
LLM 部分遺漏 → 遺漏的資料標記 failed
下次執行時 → get_unanalyzed_data() 包含 failed 資料 → 重新送入
分析成功後 → clear_analysis_failure() 清除失敗記錄
連續失敗 3 次 → 永久標記，不再重試
```

---

## 十一、故障排除速查

| 症狀 | 最可能原因 | 診斷指令 | 處理方式 |
|------|------------|----------|----------|
| 蒐集 0 筆資料 | API 金鑰失效或額度用盡 | `npm run test:collect` | 確認 Tavily token 有效 |
| LLM 分析批次失敗 | Gemini 輸出格式異常 | `npm run test:analyze` | 失敗資料自動重試，無需手動處理 |
| LINE 未收到訊息 | Token 或 User ID 錯誤 | `npm run test:line` | 重新確認 `.env` 的 LINE 設定 |
| Telegram 未收到 | Chat ID 錯誤 | `npm run test:telegram` | 執行 `node get_telegram_id.js` |
| GitHub push 失敗 (404) | PAT Token 過期 | `git remote -v` | 更新 GitHub Personal Access Token |
| HTML 報告空白 | htmlpreview 快取延遲 | 確認 GitHub 上 `.html` 是否已更新 | 等候 1–2 分鐘後重新整理 |
| 今日流程被跳過 | `.pipeline.lock` 鎖定 | `cat .pipeline.lock` | 加 `--force` 或刪除 `.pipeline.lock` |
| 月報/週報未觸發 | 距上次 < 7 天 | 查 DB 中最後 report_type 記錄 | `node src/send_weekly_now.js` 或 `send_monthly_now.js` |

---

## 十二、完整檔案結構

```
{project}/
│
├── src/
│   ├── index.js                     ★ 主入口：排程 + 五階段流程串接
│   ├── config.js                    ★ 品牌適配的唯一設定入口
│   ├── send_weekly_now.js           手動補發週報
│   ├── send_monthly_now.js          手動補發月報
│   ├── send_today.js                重送今日日報通知
│   │
│   ├── collectors/
│   │   ├── base_collector.js        基底類別（重試 / 格式化 / 防呆）
│   │   ├── tavily_collector.js      ✅ 主力蒐集器（A/A2/B/C 四階段）
│   │   ├── dcard_collector.js       ✅ Dcard 台灣社群
│   │   └── threads_collector.js     ✅ Threads 社群平台
│   │
│   ├── analyzer/
│   │   ├── analyzer.js              批次分析主控（每批 10 筆）
│   │   ├── llm_client.js            Gemini API 呼叫 + 多階段 JSON 修復
│   │   └── prompt_templates.js      ⚠️ 含硬字串（換品牌時需更新第 80 行）
│   │
│   ├── reporter/
│   │   ├── daily_report.js          ⚠️ 含標題硬字串（換品牌時需更新第 84 行）
│   │   ├── daily_report_promax.js   HTML Pro Max 視覺面板（含週/月報版面）
│   │   └── weekly_report.js         週報 + 月報生成器（含方案 B 判斷邏輯）
│   │
│   ├── notifier/
│   │   ├── line_notifier.js         LINE Bot 推送
│   │   └── telegram_notifier.js     Telegram Bot 推送
│   │
│   └── utils/
│       ├── db.js                    JSON 檔案資料庫讀寫
│       └── logger.js                Winston 結構化日誌
│
├── reports/                         報告輸出目錄（Git 追蹤）
├── data/brand_sentinel.json         主資料庫（Git 追蹤）
│
├── backup_to_github.bat             每日自動備份腳本（02:00）
├── push_git.bat                     🔴 首次初始化（只用一次）
├── save_git.bat                     🔵 手動推送程式碼更新
├── run_now.bat                      → run.bat --now（排程實際呼叫）
├── run.bat                          → node src/index.js %*
├── install_backup_task.js           註冊 02:00 備份排程
├── install_task.js                  註冊 10:00 主流程排程
│
├── .env                             金鑰（嚴禁上傳 GitHub）
├── .env.example                     金鑰範本（Git 追蹤）
└── .gitignore                       版控過濾規則
```

---

## 附錄 A：換品牌快速清單

複製此清單，換品牌時逐項打勾：

```
□ src/config.js
    □ primary_brand
    □ keywords[]
    □ competitors[]（名稱 + 關鍵字）
    □ international_queries[]
    □ topic_categories[]（按品牌特性調整）

□ src/collectors/tavily_collector.js
    □ 本土搜尋語句陣列（第 26 行附近）
    □ 評論搜尋語句陣列（第 41 行附近）

□ src/analyzer/prompt_templates.js
    □ build_insight_prompt 中的服務對象描述（第 80 行附近）

□ src/reporter/daily_report.js
    □ 報告標題（第 84 行附近的品牌名稱）

□ src/index.js
    □ obsidian_dir 路徑（第 170 行附近）
    □ file_name 報告檔名（第 174 行附近）
    □ github_html_url 中的 repo 路徑（第 220 行附近）

□ 執行驗證
    □ npm run test:collect
    □ npm run now
    □ 確認報告品質符合第八節標準
```

---

## 附錄 B：關鍵函式介面速查

| 函式 | 位置 | 回傳值 |
|------|------|--------|
| `should_send_periodic_report(today)` | `reporter/weekly_report.js` | `{ should, type: 'weekly'\|'monthly'\|null, trigger_date }` |
| `generate_weekly_report(date)` | `reporter/weekly_report.js` | `{ report: string, data: Object }` |
| `generate_monthly_report(date)` | `reporter/weekly_report.js` | `{ report: string, stats: Object, year_month: string, weeks: Object[] }` |
| `generate_promax_report(date, weekly_data, monthly_data)` | `reporter/daily_report_promax.js` | HTML 檔案路徑 |
| `get_last_weekly_report_date()` | `utils/db.js` | `string\|null`（YYYY-MM-DD） |
| `get_last_monthly_report_date()` | `utils/db.js` | `string\|null`（YYYY-MM-DD） |

---

*Brand Sentinel SOP v4.0 ｜ 適用於任意品牌輿情監控 ｜ 2026-04-17*
