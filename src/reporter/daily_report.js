// ========================================
// 日報生成模組（v6 — Canva 原生優雅版）
// 退回使用原生大型 Markdown 標題確保文字易讀性
// 僅在點綴處使用修復過逃脫字元的彩色徽章
// ========================================

import { get_analysis_by_date, get_stats, save_report } from '../utils/db.js';
import { call_gemini_json } from '../analyzer/llm_client.js';
import { build_insight_prompt } from '../analyzer/prompt_templates.js';
import logger from '../utils/logger.js';

export async function generate_daily_report(date) {
  logger.info(`開始生成 ${date} 日報`);
  const stats = get_stats(date, date);
  const analysis = get_analysis_by_date(date);

  if (stats.total === 0) {
    logger.warn(`${date} 沒有分析資料，生成空報告`);
    return generate_empty_report(date);
  }

  let insights = { insights: [], competitor_analysis: [], risks: [] };
  try {
    const top_items = analysis.slice(0, 15);
    insights = await call_gemini_json(build_insight_prompt(stats, top_items));
    if (!insights.competitor_analysis) insights.competitor_analysis = [];
  } catch (error) {
    logger.warn(`LLM 洞察生成失敗: ${error.message}`);
    insights = { insights: ['（洞察生成失敗）'], competitor_analysis: [], risks: [] };
  }

  const top_topics = stats.by_topic.slice(0, 3);
  const topic_details = top_topics.map(topic => {
    const rep = analysis.filter(a => a.topic === topic.topic)[0];
    return {
      name: topic.topic,
      count: topic.count,
      summary: rep?.summary || '(無摘要)',
      sample: rep?.content?.substring(0, 120) || ''
    };
  });

  const total = stats.total;
  const sentiment_pcts = stats.by_sentiment.map(s => ({
    label: s.sentiment,
    count: s.count,
    pct: ((s.count / total) * 100).toFixed(1)
  }));

  const report = build_report(date, stats, sentiment_pcts, topic_details, insights);

  try {
    save_report({ report_date: date, report_type: 'daily', content: report });
  } catch (e) {
    logger.warn(`日報儲存失敗: ${e.message}`);
  }

  return report;
}

// ========================================
// 徽章工具函式 (修復 Shields.io 解析 bug)
// ========================================

function safe_str(str) {
  // Shields.io 特殊保留字元： - 和 _ 必須被取代為 -- 和 __
  return encodeURIComponent(String(str).replace(/-/g, '--').replace(/_/g, '__'));
}

// 兩段式標籤 (Label: Value)
function badge(label, value, color) {
  return `![${label}](https://img.shields.io/badge/${safe_str(label)}-${safe_str(value)}-${color}?style=flat-square)`;
}

// 單段式標籤 (Value)
function pill(text, color) {
  return `![${text}](https://img.shields.io/badge/-${safe_str(text)}-${color}?style=flat-square)`;
}

// 長條圖
function bar(pct) {
  const n = Math.round(Number(pct) / 5);
  return '`' + '█'.repeat(n) + '░'.repeat(20 - n) + '`';
}

function fmt_platform(p) {
  const m = { threads: 'Threads', dcard: 'Dcard', google_reviews: 'Google', tavily: 'Tavily', linkedin: 'LinkedIn', twitter: 'Twitter/X' };
  return m[p] || p;
}

// ========================================
// 報告組裝
// ========================================
function build_report(date, stats, sentiment_pcts, topic_details, insights) {

  const pos = sentiment_pcts.find(s => s.label === '正面') || { pct: '0', count: 0 };
  const neu = sentiment_pcts.find(s => s.label === '中性') || { pct: '0', count: 0 };
  const neg = sentiment_pcts.find(s => s.label === '負面') || { pct: '0', count: 0 };

  const health_color = Number(pos.pct) >= 60 ? '00C49A' : Number(pos.pct) >= 40 ? 'FFAB00' : 'FF5630';
  const health_text  = Number(pos.pct) >= 60 ? '🟢 健康' : Number(pos.pct) >= 40 ? '🟡 留意' : '🔴 警戒';

  // ── Banner ──────────────────────────────
  const banner = `<div align="center">

![BRAND SENTINEL](https://img.shields.io/badge/BRAND%20SENTINEL-Canva%20戰情室-8B3CF7?style=for-the-badge&labelColor=6E42D3)

# 📊 Canva 品牌輿情日報

${badge('報告日期', date, '8B3CF7')} ${badge('品牌狀態', health_text, health_color)} ${badge('監控品牌', 'Canva, Figma, Adobe', '00C4CC')} ${badge('今日聲量', stats.total + ' 筆', '6E42D3')}

<br>

</div>`;

  // ── 今日概覽 ────────────────────────────
  const platform_pills = stats.by_platform
    .map(p => pill(`${fmt_platform(p.platform)} ${p.count} 筆`, '00C4CC'))
    .join(' ');

  const overview = `## 📋 今日概覽

| 項目 | 數據 |
|:-----|:-----|
| **來源分布** | ${platform_pills} |
| **有效筆數** | ${pill(stats.total + ' 筆完整分析資料', '6E42D3')} |`;

  // ── 情緒分布 ─────────────────────────────
  const sentiment = `## 💬 情緒分布

| 情緒 | 佔比 | 筆數 | 視覺化比例 |
|:----:|-----:|-----:|:-----------|
| 🟢 **正面** | ${pos.pct}% | ${pos.count} 筆 | ${bar(pos.pct)} |
| 🟡 **中性** | ${neu.pct}% | ${neu.count} 筆 | ${bar(neu.pct)} |
| 🔴 **負面** | ${neg.pct}% | ${neg.count} 筆 | ${bar(neg.pct)} |`;

  // ── 競品矩陣 ─────────────────────────────
  let competitor = '';
  if (stats.by_brand && stats.by_brand.length > 0) {
    const rows = stats.by_brand.map(b => {
      const t = b.count || 1;
      const pp = ((b.positive / t) * 100).toFixed(0);
      const np = ((b.negative / t) * 100).toFixed(0);
      const up = ((b.neutral / t) * 100).toFixed(0);
      const c  = Number(pp) >= 60 ? '00C49A' : Number(pp) >= 40 ? 'FFAB00' : 'FF5630';
      return `| **${b.brand}** | ${b.count} 筆 | ${pill('正面 ' + pp + '%', c)} | ${up}% | ${np}% |`;
    }).join('\n');

    competitor = `## ⚔️ 競品聲量對照

| 品牌 | 聲量 | 正面比例 | 中性比例 | 負面比例 |
|:-----|:----:|:--------:|:--------:|:--------:|
${rows}

> 半徑指標：🟢 正面 ≥ 60% 為健康 ｜ 🟡 40~59% 需留意 ｜ 🔴 < 40% 警戒`;
  }

  // ── 熱門主題 ─────────────────────────────
  const topic_category_colors = ['8B3CF7', '00C4CC', '6E42D3'];
  const topic_items = topic_details.map((t, i) => {
    return `### ${['🥇', '🥈', '🥉'][i] || '📌'} ${t.name}
${pill(t.count + ' 筆討論', topic_category_colors[i])}

${t.summary}

> _「${t.sample}…」_`;
  }).join('\n\n<br>\n\n');

  const topics = `## 🔥 熱門主題 TOP 3

${topic_items}`;

  // ── 關鍵洞察 ─────────────────────────────
  const insight_items = (insights.insights || []).map((s, i) => `${i + 1}. ${s}`).join('\n\n');

  const insight = `## 🧠 關鍵洞察

> [!IMPORTANT]
> 以下洞察由 AI 根據今日輿情資料生成，供投資決策參考。

${insight_items}`;

  // ── 競品觀察 ─────────────────────────────
  let comp_obs = '';
  if (insights.competitor_analysis && insights.competitor_analysis.length > 0) {
    const items = insights.competitor_analysis.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
    comp_obs = `## 🔭 競品觀察

> [!TIP]
> Canva 與 Figma、Adobe Express 在輿情市場上的差異解讀。

${items}`;
  }

  // ── 風險警示 ─────────────────────────────
  let risk = '';
  if (insights.risks && insights.risks.length > 0) {
    const items = insights.risks.map(r => `- ${r}`).join('\n');
    risk = `## 🚨 風險警示

> [!WARNING]
> 以下議題出現異常輿情訊號，建議密切關注後續發展。

${items}`;
  }

  // ── 頁尾 ─────────────────────────────────
  const footer = `---

<div align="center">

${badge('系統', 'Brand Sentinel', '6E42D3')} ${badge('大腦', 'Gemini 2.5 Flash', '4285F4')} ${badge('自動生成', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }), '8B3CF7')}

**Brand Sentinel** · 專為 Canva 打造的自動輿情追蹤器

</div>`;

  return [
    banner,
    overview,
    '',
    '---',
    '',
    sentiment,
    '',
    competitor ? '---' : '',
    '',
    competitor,
    '',
    '---',
    '',
    topics,
    '',
    '---',
    '',
    insight,
    '',
    comp_obs,
    '',
    risk,
    '',
    footer
  ].filter(s => s !== undefined).join('\n');
}

// ========================================
// 空報告
// ========================================
function generate_empty_report(date) {
  return `<div align="center">

# 📊 Canva 品牌輿情日報 — ${date}

${pill('今日狀態：無資料', 'lightgrey')}

</div>

> [!NOTE]
> 今日無蒐集資料，系統將於明日重新嘗試。

---

<div align="center">
**Brand Sentinel** · 自動生成
</div>`;
}

if (process.argv.includes('--test')) {
  const today = new Date().toISOString().split('T')[0];
  const test_date = process.argv[process.argv.indexOf('--test') + 1] || today;
  generate_daily_report(test_date).then(() => process.exit(0));
}
