// ========================================
// 日報生成模組（定案版 - 清爽原生視覺版）
// 退回使用者最滿意的 V7.2 乾淨排版，做為永久標準模板
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
    logger.info(`日報已儲存: ${date}`);
  } catch (e) {
    logger.warn(`日報儲存失敗: ${e.message}`);
  }

  return report;
}

// 產生視覺化長條圖
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

  const health_text = Number(pos.pct) >= 60 ? '🟢 健康狀態良好' : Number(pos.pct) >= 40 ? '🟡 需持續留意' : '🔴 處於警戒狀態';

  // ── 頂部大標題 ──────────────────────────────
  const banner = `<div align="center">
  <h1>✨ Brand Sentinel 品牌輿情日報</h1>
  <p><b>${date}</b> ｜ 監控標的：Canva, Figma, Adobe</p>
  <p>${health_text}</p>
</div>`;

  // ── 今日概覽 ────────────────────────────
  const platform_dist = stats.by_platform.map(p => `**${fmt_platform(p.platform)}** (${p.count} 筆)`).join(' 、 ');
  const overview = `
<br>

<h2 align="center">🟣 今日概覽</h2>

<div align="center">
今日系統共收集並分析了 <b>${stats.total}</b> 筆有效的網路聲量。<br>
資料來源分布為：${platform_dist}。
</div>

<br>
`;

  // ── 情緒分布 ─────────────────────────────
  const sentiment = `
---

<h2>📊 情緒分布</h2>

| 情感 | 佔比 | 筆數 | 視覺化走勢 |
|:----:|-----:|-----:|:-----------|
| 🟢 **正面** | ${pos.pct}% | ${pos.count} 筆 | ${bar(pos.pct)} |
| 🟡 **中性** | ${neu.pct}% | ${neu.count} 筆 | ${bar(neu.pct)} |
| 🔴 **負面** | ${neg.pct}% | ${neg.count} 筆 | ${bar(neg.pct)} |
`;

  // ── 競品矩陣 ─────────────────────────────
  let competitor = '';
  if (stats.by_brand && stats.by_brand.length > 0) {
    const rows = stats.by_brand.map(b => {
      const t = b.count || 1;
      const pp = ((b.positive / t) * 100).toFixed(0);
      const np = ((b.negative / t) * 100).toFixed(0);
      const up = ((b.neutral / t) * 100).toFixed(0);
      const c  = Number(pp) >= 60 ? '🟢' : Number(pp) >= 40 ? '🟡' : '🔴';
      return `| **${b.brand}** | ${b.count} 筆 | ${c} ${pp}% | ${up}% | ${np}% |`;
    }).join('\n');

    competitor = `
---

<h2>⚔️ 競品聲量對照</h2>

| 品牌 | 總聲量 | 正面比例 | 中性比例 | 負面比例 |
|:-----|:----:|:--------:|:--------:|:--------:|
${rows}

> 判讀基準：🟢 正面 ≥ 60% 為健康 ｜ 🟡 40~59% 需留意 ｜ 🔴 < 40% 警戒
`;
  }

  // ── 熱門主題 ─────────────────────────────
  const topic_items = topic_details.map((t, i) => {
    return `${i + 1}. **${t.name}** (共 ${t.count} 筆討論)  \n   ${t.summary}  \n   > _「${t.sample}…」_`;
  }).join('\n\n');

  const topics = `
---

<h2>🔥 熱門主題 TOP 3</h2>

${topic_items}
`;

  // ── 關鍵洞察 ─────────────────────────────
  const insight_items = (insights.insights || []).map((s, i) => `${i + 1}. ${s.replace(/^[-*0-9.\\s]+/, '')}`).join('\n\n');
  const insight = `
---

<h2>🧠 關鍵洞察</h2>

> [!IMPORTANT]
> 以下洞察由 AI 根據今日輿情資料生成，供投資決策參考。

${insight_items}
`;

  // ── 競品觀察 ─────────────────────────────
  let comp_obs = '';
  if (insights.competitor_analysis && insights.competitor_analysis.length > 0) {
    const items = insights.competitor_analysis.map((c, i) => `${i + 1}. ${c.replace(/^[-*0-9.\\s]+/, '')}`).join('\n\n');
    comp_obs = `
---

<h2>🔭 競品觀察</h2>

> [!TIP]
> Canva 與 Figma、Adobe Express 在今日輿情市場上的差異解讀。

${items}
`;
  }

  // ── 風險警示 ─────────────────────────────
  let risk = '';
  if (insights.risks && insights.risks.length > 0) {
    const items = insights.risks.map((r, i) => `${i + 1}. ${r.replace(/^[-*0-9.\\s]+/, '')}`).join('\n\n');
    risk = `
---

<h2>🚨 風險警示</h2>

> [!WARNING]
> 以下議題出現異常輿情訊號，建議密切關注後續發展。

${items}
`;
  }

  // ── 頁尾 ─────────────────────────────────
  const footer = `
---

<div align="center">
  <p><b>Brand Sentinel</b> · 專為 Canva 打造的自動輿情追蹤器</p>
  <p><sub>Powered by Gemini 2.5 Flash ｜ ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} (UTC+8)</sub></p>
</div>
`;

  return [
    banner,
    overview,
    sentiment,
    competitor,
    topics,
    insight,
    comp_obs,
    risk,
    footer
  ].filter(s => s).join('\n');
}

// ========================================
// 空報告產生器
// ========================================
function generate_empty_report(date) {
  return `<div align="center">
  <h1>✨ Brand Sentinel 品牌輿情日報</h1>
  <p><b>${date}</b></p>
</div>

---

<h2 align="center">⚪ 今日狀態：無新資料</h2>

> [!NOTE]
> 今日未蒐集到符合條件的公開討論，系統將於明日重新嘗試。

---

<div align="center">
  <p><b>Brand Sentinel</b> · 自動生成</p>
</div>`;
}

// ========================================
// 獨立測試模式
// ========================================
if (process.argv.includes('--test')) {
  const today = new Date().toISOString().split('T')[0];
  const test_date = process.argv[process.argv.indexOf('--test') + 1] || today;
  logger.info(`🧪 日報生成測試：${test_date}`);
  generate_daily_report(test_date)
    .then(r => { console.log('\n' + '='.repeat(60) + '\n' + r + '\n' + '='.repeat(60)); process.exit(0); })
    .catch(e => { console.error('❌ 日報生成失敗:', e.message); process.exit(1); });
}
