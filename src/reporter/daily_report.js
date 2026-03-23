// ========================================
// 日報生成模組（UI/UX Pro Max 降維打擊版）
// 把 UI/UX Pro Max 的「Bento Grid 便當盒佈局」與「資訊層級理論」
// 移植到原生的 GitHub Markdown 環境
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
  const health_text = Number(pos.pct) >= 60 ? '狀態良好' : Number(pos.pct) >= 40 ? '需持續留意' : '處於警戒狀態';

  // ── 頂部宣告區 (Executive Dashboard) ──────────────────────────────
  const banner = `<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Canva_icon_2021.svg" height="50" alt="Canva Logo">
  <br><br>
  
  <h1>UI/UX Pro Max 戰情儀表板</h1>
  <p><b>生成日期：${date}</b> ｜ <b>監控標的</b>：Canva, Figma, Adobe</p>
</div>`;

  // ── Bento Grid 模組一：核心數據 ────────────────────────────
  const bento1 = `
<table width="100%">
  <tr>
    <td width="50%" align="center">
      <h3>📈 聲量規模</h3>
      <h1>${stats.total} 筆</h1>
      <sub>整體品牌健康度 ${health_color} ${health_text}</sub>
    </td>
    <td width="50%" align="center">
      <h3>🌐 資訊覆蓋網</h3>
      ${stats.by_platform.map(p => `\`${fmt_platform(p.platform)}\` 收集 <b>${p.count}</b> 筆`).join('<br>')}
    </td>
  </tr>
</table>`;

  // ── Bento Grid 模組二：競品與情緒矩陣 ─────────────────────────────
  let rows = '';
  if (stats.by_brand && stats.by_brand.length > 0) {
    rows = stats.by_brand.map(b => {
      const t = b.count || 1;
      const pp = ((b.positive / t) * 100).toFixed(0);
      return `<b>${b.brand}</b> (${b.count}筆) ── 正向比例 ${pp}%`;
    }).join('<br><br>');
  }

  const bento2 = `
<table width="100%">
  <tr>
    <td width="50%">
      <h3>💬 情緒剖析引擎</h3><br>
      🟢 <b>正向 (${pos.pct}%)</b> <sup>共 ${pos.count}筆</sup><br>
      ${bar(pos.pct)}<br><br>
      🟡 <b>中立 (${neu.pct}%)</b> <sup>共 ${neu.count}筆</sup><br>
      ${bar(neu.pct)}<br><br>
      🔴 <b>負向 (${neg.pct}%)</b> <sup>共 ${neg.count}筆</sup><br>
      ${bar(neg.pct)}
    </td>
    <td width="50%">
      <h3>⚔️ 競品市佔率比較</h3><br>
      ${rows}
    </td>
  </tr>
</table>`;

  const cleanNum = (str) => str.replace(/^[-*0-9.\\s]+/, '');

  // ── 熱門主題區塊 ─────────────────────────────
  const topic_items = topic_details.map((t, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || '📌';
    return `> **${i + 1}. ${medal} ${t.name} (共 ${t.count} 筆)**  \n> ${t.summary}  \n> _💬「${t.sample}…」_`;
  }).join('\n>\n');

  const topics = `
## 🔥 熱議風向標 TOP 3

${topic_items}
`;

  // ── 深度洞察與分析 Bento ─────────────────────────────
  const insight_content = (insights.insights || []).map((s, i) => `**${i + 1}.** ${cleanNum(s)}`).join('<br><br>');
  const comp_content = (insights.competitor_analysis || []).map((c, i) => `**${i + 1}.** ${cleanNum(c)}`).join('<br><br>');
  const risk_content = (insights.risks || []).map((r, i) => `**${i + 1}.** ${cleanNum(r)}`).join('<br><br>');

  const analysis_blocks = `
<table width="100%">
  <tr>
    <td>
      <h3>🧠 AI 決策洞察艙</h3>
      ${insight_content}
    </td>
  </tr>
  <tr>
    <td>
      <h3>🔭 市場動態雷達</h3>
      ${comp_content}
    </td>
  </tr>
  <tr>
    <td>
      <h3>⚠️ 潛在風險預警</h3>
      ${risk_content}
    </td>
  </tr>
</table>`;

  // ── 頁尾 ─────────────────────────────────
  const footer = `
---

<div align="center">
  <p><sub><b>Brand Sentinel 輿情系統</b> ｜ Topology UI/UX Pro Max Pattern ｜ ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</sub></p>
</div>`;

  return [
    banner,
    '<br>',
    bento1,
    '<br>',
    bento2,
    '<br>',
    topics,
    '<br>',
    analysis_blocks,
    '<br>',
    footer
  ].filter(s => s).join('\n');
}

function generate_empty_report(date) {
  return `<div align="center">
  <h1>✨ UI/UX Pro Max 戰情儀表板</h1>
  <p><b>執行日期：${date}</b></p>
</div>

<table width="100%">
  <tr><td align="center"><h3>⚪ 今日狀態：無新資料</h3><br><p>系統未發現公開討論，將於明日重試。</p></td></tr>
</table>`;
}

if (process.argv.includes('--test')) {
  const today = new Date().toISOString().split('T')[0];
  const test_date = process.argv[process.argv.indexOf('--test') + 1] || today;
  generate_daily_report(test_date)
    .then(r => { console.log('\n'+r+'\n'); process.exit(0); });
}
