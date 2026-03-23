// ========================================
// 日報生成模組（UI/UX Pro Max 垂直排版精煉版）
// 徹底捨棄導致視覺疲勞與版面破碎的 HTML <table>
// 全面採用「垂直降流 (Vertical Rhythm)」與「資訊層級 (Visual Hierarchy)」
// 確保於 GitHub 環境呈現最高可讀性與現代感。
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

function build_report(date, stats, sentiment_pcts, topic_details, insights) {

  const pos = sentiment_pcts.find(s => s.label === '正面') || { pct: '0', count: 0 };
  const neu = sentiment_pcts.find(s => s.label === '中性') || { pct: '0', count: 0 };
  const neg = sentiment_pcts.find(s => s.label === '負面') || { pct: '0', count: 0 };

  const health_color = Number(pos.pct) >= 60 ? '🟢' : Number(pos.pct) >= 40 ? '🟡' : '🔴';
  const health_text = Number(pos.pct) >= 60 ? '優良' : Number(pos.pct) >= 40 ? '觀察中' : '警戒';

  // 1. Executive Summary ──────────────────────────────
  const banner = `# 📊 Canva Brand Sentinel 每日戰報

> **情報更新時間**：${date}
> **追蹤涵蓋範圍**：Canva, Figma, Adobe

## 🎯 核心體驗指標 (KPI)

*   **總採樣數據量**：\`${stats.total} 筆\`
*   **總體品牌防線**：${health_color} **${health_text}**
*   **資料來源佔比**：${stats.by_platform.map(p => `\`${fmt_platform(p.platform)}\` (${p.count})`).join(', ')}`;

  // 2. Sentiment Engine ──────────────────────────────
  let comp_rows = '';
  if (stats.by_brand && stats.by_brand.length > 0) {
    comp_rows = stats.by_brand.map(b => {
      const t = b.count || 1;
      const pp = ((b.positive / t) * 100).toFixed(0);
      return `*   **${b.brand}**（${b.count}筆）：正向情感佔 **${pp}%**`;
    }).join('\n');
  } else {
    comp_rows = '*   本期範圍內無直接競品討論數據。';
  }

  const sentiment_and_comp = `## 💬 輿情與市場動態 (Sentiment & Market)

### 口碑情緒雷達

> 🟢 **正向 (${pos.pct}%)** ｜ 共 ${pos.count} 筆
> ${bar(pos.pct)}
> 
> 🟡 **中立 (${neu.pct}%)** ｜ 共 ${neu.count} 筆
> ${bar(neu.pct)}
> 
> 🔴 **負向 (${neg.pct}%)** ｜ 共 ${neg.count} 筆
> ${bar(neg.pct)}

### 品牌聲量市佔分析

${comp_rows}`;

  // 3. Hot Topics ──────────────────────────────
  const topic_items = topic_details.map((t, i) => {
    return `> **0${i + 1}. ${t.name} (共 ${t.count} 筆)**
> ▍事件摘要：${t.summary}
> ▍代表原音：_${t.sample}…_`;
  }).join('\n>\n');

  const topics = `## 🔥 高熱度風向 (Trending Topics)

${topic_items}`;

  // 4. Deep Insights ──────────────────────────────
  const cleanNum = (str) => str.replace(/^[-*0-9.\\s]+/, '');

  const insight_content = (insights.insights || []).map((s, i) => `**0${i + 1}.** ${cleanNum(s)}`).join('\n\n');
  const comp_content = (insights.competitor_analysis || []).map((c, i) => `**0${i + 1}.** ${cleanNum(c)}`).join('\n\n');
  const risk_content = (insights.risks || []).map((r, i) => `**0${i + 1}.** ${cleanNum(r)}`).join('\n\n');

  const analysis_blocks = `## 🧠 決策洞察艙 (AI Deep Insights)

### 💡 商業與產品洞察
${insight_content || '* 無重大變動信號。'}

### 🔭 競品戰略分析
${comp_content || '* 本期未探測到具體戰略信號。'}

### ⚠️ 發展風險預警
${risk_content || '* 本期未探測到重大危機信號。'}`;

  // 5. Footer ─────────────────────────────────
  const footer = `---
*Brand Sentinel 自動化演算法 ｜ 結構化純淨終端模板 UI/UX Pro Max ｜ 產生時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}*`;

  return [
    banner,
    sentiment_and_comp,
    topics,
    analysis_blocks,
    footer
  ].filter(s => s).join('\n\n');
}

function generate_empty_report(date) {
  return `# 📊 Brand Sentinel 空白簡報

> **情報更新時間**：${date}

## ⚪ 狀態：無新增訊號

系統在所有追蹤的資料來源中，尚未發現指定的品牌討論軌跡。將於下一次排程區間再次執行深度掃描。`;
}

if (process.argv.includes('--test')) {
  const today = new Date().toISOString().split('T')[0];
  const test_date = process.argv[process.argv.indexOf('--test') + 1] || today;
  generate_daily_report(test_date)
    .then(r => { console.log('\n'+r+'\n'); process.exit(0); });
}
