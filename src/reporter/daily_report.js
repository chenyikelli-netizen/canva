// ========================================
// 日報生成模組（Phase 2.5 精美視覺版）
// 使用 GitHub Alert、表格、分隔線等元素
// 產出具備高度可讀性的精美 Markdown 報告
// ========================================

import { get_analysis_by_date, get_stats, save_report } from '../utils/db.js';
import { call_gemini_json } from '../analyzer/llm_client.js';
import { build_insight_prompt } from '../analyzer/prompt_templates.js';
import logger from '../utils/logger.js';

/**
 * 生成指定日期的日報
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Promise<string>} Markdown 格式的日報內容
 */
export async function generate_daily_report(date) {
  logger.info(`開始生成 ${date} 日報`);

  const stats = get_stats(date, date);
  const analysis = get_analysis_by_date(date);

  if (stats.total === 0) {
    logger.warn(`${date} 沒有分析資料，生成空報告`);
    return generate_empty_report(date);
  }

  // 取得 LLM 生成的洞察
  let insights = { insights: [], competitor_analysis: [], risks: [] };
  try {
    const top_items = analysis.slice(0, 15);
    insights = await call_gemini_json(build_insight_prompt(stats, top_items));
    if (!insights.competitor_analysis) insights.competitor_analysis = [];
  } catch (error) {
    logger.warn(`LLM 洞察生成失敗: ${error.message}`);
    insights = { insights: ['（洞察生成失敗，請查看原始資料）'], competitor_analysis: [], risks: [] };
  }

  const top_topics = stats.by_topic.slice(0, 3);
  const topic_details = top_topics.map(topic => {
    const topic_items = analysis.filter(a => a.topic === topic.topic);
    const representative = topic_items[0];
    return {
      name: topic.topic,
      count: topic.count,
      summary: representative?.summary || '(無摘要)',
      sample: representative?.content?.substring(0, 120) || '(無內容)'
    };
  });

  const total = stats.total;
  const sentiment_pcts = stats.by_sentiment.map(s => ({
    label: s.sentiment,
    count: s.count,
    pct: ((s.count / total) * 100).toFixed(1)
  }));

  const report = build_report_markdown(date, stats, sentiment_pcts, topic_details, insights);

  try {
    save_report({ report_date: date, report_type: 'daily', content: report });
    logger.info(`日報已儲存: ${date}`);
  } catch (error) {
    logger.warn(`日報儲存失敗: ${error.message}`);
  }

  return report;
}

/**
 * 組裝精美版日報 Markdown
 */
function build_report_markdown(date, stats, sentiment_pcts, topic_details, insights) {

  // ===== 標題區 =====
  const header = `# 📊 Canva 品牌輿情日報
## ${date}

> **Brand Sentinel** 自動化輿情監控系統 — 每日為您追蹤 Canva、Figma、Adobe Express 三大設計工具品牌的市場脈動。`;

  // ===== 今日總覽表格 =====
  const platform_dist = stats.by_platform
    .map(p => `${format_platform_name(p.platform)} **${p.count}** 筆`)
    .join(' ｜ ');

  const overview = `
---

## 🗂️ 今日總覽

| 指標 | 數據 |
|:-----|:-----|
| 📄 **總蒐集筆數** | **${stats.total}** 筆 |
| 🌐 **平台分布** | ${platform_dist} |
| 📅 **報告日期** | ${date} |`;

  // ===== 情緒分析區塊 =====
  const pos = sentiment_pcts.find(s => s.label === '正面') || { pct: '0', count: 0 };
  const neu = sentiment_pcts.find(s => s.label === '中性') || { pct: '0', count: 0 };
  const neg = sentiment_pcts.find(s => s.label === '負面') || { pct: '0', count: 0 };

  const pos_bar = make_bar(Number(pos.pct));
  const neu_bar = make_bar(Number(neu.pct));
  const neg_bar = make_bar(Number(neg.pct));

  const sentiment_section = `
---

## 💬 情緒分析

| 情緒 | 比例 | 視覺化 | 筆數 |
|:-----|-----:|:-------|-----:|
| 🟢 正面 | **${pos.pct}%** | ${pos_bar} | ${pos.count} |
| 🟡 中性 | **${neu.pct}%** | ${neu_bar} | ${neu.count} |
| 🔴 負面 | **${neg.pct}%** | ${neg_bar} | ${neg.count} |`;

  // ===== 競品對照矩陣 =====
  let competitor_section = '';
  if (stats.by_brand && stats.by_brand.length > 0) {
    const brand_rows = stats.by_brand.map(b => {
      const total_b = b.count || 1;
      const pos_pct = ((b.positive / total_b) * 100).toFixed(0);
      const neg_pct = ((b.negative / total_b) * 100).toFixed(0);
      const neu_pct = ((b.neutral / total_b) * 100).toFixed(0);
      const health = Number(pos_pct) >= 60 ? '🟢 健康' : Number(pos_pct) >= 40 ? '🟡 留意' : '🔴 警戒';
      return `| **${b.brand}** | ${b.count} | ${pos_pct}% | ${neu_pct}% | ${neg_pct}% | ${health} |`;
    }).join('\n');

    competitor_section = `
---

## ⚔️ 競品對照矩陣

| 品牌 | 聲量 | 正面 | 中性 | 負面 | 健康狀態 |
|:-----|-----:|-----:|-----:|-----:|:---------|
${brand_rows}

> [!NOTE]
> 🟢 正面 ≥ 60% 為健康 ｜ 🟡 40%~59% 需留意 ｜ 🔴 < 40% 進入警戒`;
  }

  // ===== 熱門主題 =====
  const topics_section_items = topic_details.map((t, i) => {
    const emoji = ['🥇', '🥈', '🥉'][i] || '📌';
    return `### ${emoji} ${t.name}（${t.count} 筆）

${t.summary}

> 💬 _「${t.sample}...」_`;
  }).join('\n\n');

  const topics_section = `
---

## 🔥 熱門主題 TOP ${topic_details.length}

${topics_section_items}`;

  // ===== 關鍵洞察 =====
  const insights_items = (insights.insights || [])
    .map(insight => `- 💡 ${insight}`)
    .join('\n');

  const insights_section = `
---

## 🧠 關鍵洞察

> [!IMPORTANT]
> 以下洞察由 AI 根據今日蒐集的輿情資料自動生成，供投資決策參考。

${insights_items}`;

  // ===== 競品觀察 =====
  let competitor_insights = '';
  if (insights.competitor_analysis && insights.competitor_analysis.length > 0) {
    const comp_items = insights.competitor_analysis
      .map(c => `- 🔍 ${c}`)
      .join('\n');

    competitor_insights = `
---

## 🔭 競品觀察

> [!TIP]
> Canva 與 Figma、Adobe Express 在輿情市場上的差異解讀。

${comp_items}`;
  }

  // ===== 風險警示 =====
  let risk_section = '';
  if (insights.risks && insights.risks.length > 0) {
    const risk_items = insights.risks
      .map(r => `- ⚠️ ${r}`)
      .join('\n');

    risk_section = `
---

## 🚨 風險警示

> [!WARNING]
> 以下議題出現異常輿情訊號，建議密切關注後續發展。

${risk_items}`;
  }

  // ===== 頁尾 =====
  const footer = `
---

<div align="center">

🛡️ **Brand Sentinel** — Canva 品牌輿情自動監控系統

_報告自動生成於 ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} (UTC+8)_

</div>`;

  // ===== 組裝全文 =====
  return [
    header,
    overview,
    sentiment_section,
    competitor_section,
    topics_section,
    insights_section,
    competitor_insights,
    risk_section,
    footer
  ].filter(Boolean).join('\n');
}

/**
 * 生成視覺化長條
 */
function make_bar(pct) {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  return '`' + '▓'.repeat(filled) + '░'.repeat(empty) + '`';
}

/**
 * 生成空報告
 */
function generate_empty_report(date) {
  return `# 📊 Canva 品牌輿情日報
## ${date}

> [!NOTE]
> 今日無蒐集資料，系統將於明日重新嘗試。

---

<div align="center">

🛡️ **Brand Sentinel** — 自動生成

</div>`;
}

/**
 * 格式化平台名稱
 */
function format_platform_name(platform) {
  const names = {
    threads: '🧵 Threads',
    dcard: '💬 Dcard',
    google_reviews: '🔍 Google',
    tavily: '🌐 Tavily',
    linkedin: '💼 LinkedIn',
    twitter: '🐦 Twitter/X'
  };
  return names[platform] || platform;
}

// 支援獨立測試模式
if (process.argv.includes('--test')) {
  const today = new Date().toISOString().split('T')[0];
  const test_date = process.argv[process.argv.indexOf('--test') + 1] || today;

  logger.info(`🧪 日報生成測試：${test_date}`);
  generate_daily_report(test_date)
    .then(report => {
      console.log('\n' + '='.repeat(60));
      console.log(report);
      console.log('='.repeat(60));
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 日報生成失敗:', error.message);
      process.exit(1);
    });
}
