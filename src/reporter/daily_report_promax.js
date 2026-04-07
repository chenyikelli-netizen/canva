// ========================================
// UI UX PRO MAX 版 - 互動式網頁報告產生器
// 風格: Dark Mode + Aurora Glassmorphism + Bento Grid
// ========================================

import fs from 'fs';
import path from 'path';
import { get_analysis_by_date, get_stats } from '../utils/db.js';
import { call_gemini_json } from '../analyzer/llm_client.js';
import { build_insight_prompt } from '../analyzer/prompt_templates.js';
import logger from '../utils/logger.js';

export async function generate_promax_report(date, weekly_data = null) {
  logger.info(`開始生成 ${date} PRO MAX 報告`);
  const stats = get_stats(date, date);
  const analysis = get_analysis_by_date(date);

  if (stats.total === 0) {
    logger.warn('無資料');
    return;
  }

  let insights = { insights: [], competitor_analysis: [], risks: [] };
  try {
    const top_items = analysis.slice(0, 15);
    insights = await call_gemini_json(build_insight_prompt(stats, top_items));
  } catch (e) {
    logger.warn('Insights 失敗');
  }

  const top_topics = stats.by_topic.slice(0, 3);
  const topic_details = top_topics.map(topic => {
    const rep = analysis.filter(a => a.topic === topic.topic)[0];
    return {
      name: topic.topic,
      count: topic.count,
      summary: rep?.summary || '',
      sample: rep?.content?.substring(0, 100) || ''
    };
  });

  const total = stats.total;
  const pos = stats.by_sentiment.find(s => s.sentiment === '正面') || { count: 0 };
  const neu = stats.by_sentiment.find(s => s.sentiment === '中性') || { count: 0 };
  const neg = stats.by_sentiment.find(s => s.sentiment === '負面') || { count: 0 };
  
  const posPct = ((pos.count / total) * 100).toFixed(1);
  const neuPct = ((neu.count / total) * 100).toFixed(1);
  const negPct = ((neg.count / total) * 100).toFixed(1);

  // 渲染平台區塊
  const platformsHtml = stats.by_platform.map(p => `
    <div class="source-row">
      <span class="source-name">${p.platform}</span>
      <span class="source-badge">${p.count}</span>
    </div>
  `).join('');

  // 渲染主題區塊
  const topicsHtml = topic_details.map((t, i) => `
    <div class="topic-card">
      <div class="topic-header">
        <h3 class="topic-title">
          <span class="topic-medal">${['🥇', '🥈', '🥉'][i] || '📌'}</span> ${t.name}
        </h3>
        <span class="topic-count">${t.count} 筆</span>
      </div>
      <p class="topic-desc">${t.summary}</p>
      <div class="topic-quote">
        <p>「${t.sample}…」</p>
      </div>
    </div>
  `).join('');

  // 渲染洞察區塊
  const clean = str => str.replace(/^[-*0-9.\\s]+/, '');
  const insightsHtml = (insights.insights || []).map((s, i) => `
    <div class="insight-item">
      <div class="insight-num">${i+1}</div>
      <p class="insight-text">${clean(s)}</p>
    </div>
  `).join('');

  const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { background-color: #020617; }
    body { font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif; background-color: #020617; color: #e2e8f0; min-height: 100vh; padding-bottom: 5rem; }
    ::selection { background-color: #8B3CF7; color: #fff; }
    .aurora-bg { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 0; overflow: hidden; pointer-events: none; }
    .blob { position: absolute; filter: blur(90px); border-radius: 50%; opacity: 0.5; animation: float 10s infinite ease-in-out alternate; }
    .blob-1 { top: -10%; left: -10%; width: 50vw; height: 50vw; background: radial-gradient(circle, #8B3CF7 0%, transparent 70%); }
    .blob-2 { bottom: -20%; right: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, #00C4CC 0%, transparent 70%); animation-delay: -5s; }
    @keyframes float { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(30px,-50px) scale(1.1); } }
    .container { position: relative; z-index: 1; max-width: 72rem; margin: 0 auto; padding: 4rem 1.5rem 0; }
    .glass-panel { background: rgba(255,255,255,0.03); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
    header { display: flex; flex-direction: column; gap: 1.5rem; margin-bottom: 4rem; }
    @media (min-width: 768px) { header { flex-direction: row; align-items: center; justify-content: space-between; } }
    .live-badge { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.75rem; border-radius: 9999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; color: #00C4CC; text-transform: uppercase; margin-bottom: 1rem; }
    .live-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background-color: #00C4CC; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    h1.brand-title { font-size: 2.5rem; font-weight: 800; letter-spacing: -0.025em; margin-bottom: 0.5rem; background: linear-gradient(to right, #ffffff, #cbd5e1, #64748b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    @media (min-width: 768px) { h1.brand-title { font-size: 3.75rem; } }
    .subtitle { color: #94a3b8; font-size: 1.125rem; }
    .subtitle span { color: #fff; font-weight: 500; }
    .stats-card { display: flex; align-items: center; gap: 1.5rem; padding: 1.5rem; border-radius: 1.5rem; flex-shrink: 0; }
    .stat-label { color: #94a3b8; font-size: 0.875rem; margin-bottom: 0.25rem; }
    .stat-number { font-size: 2.25rem; font-weight: 700; background: linear-gradient(to right, #8B3CF7, #00C4CC); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .stat-divider { width: 1px; height: 3rem; background: rgba(255,255,255,0.1); }
    .stat-health-good { font-size: 1.25rem; font-weight: 700; color: #34d399; display: flex; align-items: center; gap: 0.5rem; }
    .stat-health-warn { font-size: 1.25rem; font-weight: 700; color: #fbbf24; display: flex; align-items: center; gap: 0.5rem; }
    .bento-top { display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
    @media (min-width: 768px) { .bento-top { grid-template-columns: 2fr 1fr; } }
    .sentiment-panel { border-radius: 1.5rem; padding: 2rem; position: relative; overflow: hidden; }
    .sentiment-panel::before { content: ''; position: absolute; top: 0; right: 0; width: 16rem; height: 16rem; background: rgba(139,60,247,0.1); border-radius: 50%; filter: blur(48px); transform: translate(50%,-50%); }
    .panel-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem; }
    .panel-title .icon { background: rgba(255,255,255,0.1); padding: 0.5rem; border-radius: 0.75rem; }
    .bar-group { position: relative; z-index: 1; }
    .bar-group + .bar-group { margin-top: 1.5rem; }
    .bar-header { display: flex; justify-content: space-between; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; }
    .bar-track { height: 0.75rem; width: 100%; background: #1e293b; border-radius: 9999px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 9999px; }
    .bar-fill.positive { background: linear-gradient(to right, #10b981, #6ee7b7); }
    .bar-fill.neutral  { background: linear-gradient(to right, #f59e0b, #fcd34d); }
    .bar-fill.negative { background: linear-gradient(to right, #f43f5e, #fda4af); }
    .color-positive { color: #34d399; } .color-neutral  { color: #fbbf24; } .color-negative { color: #fb7185; } .color-white { color: #fff; }
    .sources-panel { border-radius: 1.5rem; padding: 2rem; display: flex; flex-direction: column; }
    .sources-panel .panel-title { font-size: 1.25rem; margin-bottom: 1.5rem; }
    .sources-list { display: flex; flex-direction: column; gap: 0.75rem; flex: 1; justify-content: center; }
    .source-row { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-radius: 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; }
    .source-row:hover { background: rgba(255,255,255,0.1); }
    .source-name { color: #cbd5e1; font-weight: 500; text-transform: capitalize; }
    .source-badge { color: #fff; font-weight: 700; background: rgba(139,60,247,0.3); padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; }
    .section-title { font-size: 1.5rem; font-weight: 700; margin-top: 3rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
    .section-title .icon-grad { background: linear-gradient(135deg, #8B3CF7, #00C4CC); padding: 0.5rem; border-radius: 0.75rem; color: #fff; }
    .topics-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-bottom: 3rem; }
    @media (min-width: 768px) { .topics-grid { grid-template-columns: repeat(3, 1fr); } }
    .topic-card { padding: 1.25rem; border-radius: 1.5rem; background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent); border: 1px solid rgba(255,255,255,0.1); transition: transform 0.2s; cursor: pointer; }
    .topic-card:hover { transform: translateY(-4px); }
    .topic-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
    .topic-title { font-size: 1.125rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    .topic-medal { font-size: 1.5rem; }
    .topic-count { font-size: 0.75rem; font-weight: 600; color: #00C4CC; background: rgba(0,196,204,0.2); padding: 0.25rem 0.5rem; border-radius: 0.5rem; }
    .topic-desc { color: #cbd5e1; font-size: 0.875rem; margin-bottom: 0.75rem; font-weight: 500; line-height: 1.6; }
    .topic-quote { padding: 0.75rem; background: rgba(0,0,0,0.4); border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.05); }
    .topic-quote p { color: #94a3b8; font-size: 0.75rem; font-style: italic; }
    .insights-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
    @media (min-width: 768px) { .insights-grid { grid-template-columns: 1fr 1fr; } }
    .insights-panel { border-radius: 1.5rem; padding: 2rem; }
    .insights-panel .panel-title { color: #a5b4fc; margin-bottom: 1.5rem; font-size: 1.5rem; }
    .insights-panel .panel-title .icon { background: rgba(99,102,241,0.2); }
    .insight-item { display: flex; gap: 1rem; padding: 1rem; border-radius: 1rem; transition: background 0.2s; }
    .insight-item:hover { background: rgba(255,255,255,0.05); }
    .insight-item + .insight-item { margin-top: 0.5rem; }
    .insight-num { flex-shrink: 0; width: 2rem; height: 2rem; border-radius: 50%; background: rgba(99,102,241,0.2); color: #a5b4fc; display: flex; align-items: center; justify-content: center; font-weight: 700; border: 1px solid rgba(99,102,241,0.3); font-size: 0.875rem; }
    .insight-text { color: #e2e8f0; font-size: 0.875rem; line-height: 1.7; }
    .right-col { display: flex; flex-direction: column; gap: 1.5rem; }
    .competitor-panel { border-radius: 1.5rem; padding: 2rem; flex: 1; }
    .competitor-panel .panel-title { color: #67e8f9; margin-bottom: 1rem; font-size: 1.25rem; }
    .competitor-panel .panel-title .icon { background: rgba(6,182,212,0.2); }
    .risk-panel { border-radius: 1.5rem; padding: 2rem; flex: 1; border-color: rgba(244,63,94,0.2) !important; background: rgba(244,63,94,0.05) !important; }
    .risk-panel .panel-title { color: #fda4af; margin-bottom: 1rem; font-size: 1.25rem; }
    .risk-panel .panel-title .icon { background: rgba(244,63,94,0.2); }
    .prose-sm { color: #cbd5e1; font-size: 0.875rem; line-height: 1.7; }
    .prose-sm p + p { margin-top: 1rem; }
    .risk-bullet { color: #f43f5e; margin-right: 0.5rem; }
    /* ── Weekly Report Section ── */
    .weekly-section { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.08); }
    .weekly-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-top: 1.5rem; }
    @media (min-width: 768px) { .weekly-grid { grid-template-columns: 1fr 1fr; } }
    .weekly-panel { border-radius: 1.5rem; padding: 2rem; }
    .weekly-panel .panel-title { color: #c4b5fd; margin-bottom: 1.5rem; }
    .weekly-panel .panel-title .icon { background: rgba(139,92,246,0.2); }
    .weekly-stat-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .weekly-stat-row:last-child { border-bottom: none; }
    .weekly-stat-label { color: #94a3b8; font-size: 0.875rem; }
    .weekly-stat-value { font-weight: 700; font-size: 0.875rem; }
    .weekly-stat-value.up { color: #34d399; }
    .weekly-stat-value.down { color: #fb7185; }
    .weekly-stat-value.neutral { color: #fbbf24; }
    .weekly-topic-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .weekly-topic-item { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.75rem; border-radius: 0.75rem; background: rgba(255,255,255,0.04); }
    .weekly-topic-item:hover { background: rgba(255,255,255,0.08); }
    .weekly-topic-name { color: #cbd5e1; font-size: 0.8rem; font-weight: 500; }
    .weekly-topic-count { color: #a5b4fc; font-size: 0.75rem; font-weight: 700; background: rgba(99,102,241,0.2); padding: 0.15rem 0.5rem; border-radius: 9999px; }
  `;

  const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brand Sentinel - UI/UX Pro Max</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>

  <!-- Aurora Background Effects -->
  <div class="aurora-bg">
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
  </div>

  <div class="container">
    <!-- Header -->
    <header>
      <div>
        <div class="live-badge">
          <span class="live-dot"></span>
          Live Monitoring Active
        </div>
        <h1 class="brand-title">Brand Sentinel</h1>
        <p class="subtitle">Canva 品牌輿情分析戰情室 ｜ <span>${date}</span></p>
      </div>
      <div class="glass-panel stats-card">
        <div>
          <p class="stat-label">今日總聲量</p>
          <p class="stat-number">${total}</p>
        </div>
        <div class="stat-divider"></div>
        <div>
          <p class="stat-label">品牌健康度</p>
          <p class="${posPct >= 60 ? 'stat-health-good' : 'stat-health-warn'}">${posPct >= 60 ? '🟢 良好' : '🟡 留意'}</p>
        </div>
      </div>
    </header>

    <!-- Bento Grid Top -->
    <div class="bento-top">
      <!-- Sentiment Overview -->
      <div class="glass-panel sentiment-panel">
        <h2 class="panel-title"><span class="icon">📊</span> 情緒健康矩陣</h2>
        <div class="bar-group">
          <div class="bar-header">
            <span class="color-positive">正向輿情 (Positive)</span>
            <span class="color-white">${pos.count} 筆 / ${posPct}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill positive" style="width:${posPct}%"></div></div>
        </div>
        <div class="bar-group">
          <div class="bar-header">
            <span class="color-neutral">中立討論 (Neutral)</span>
            <span class="color-white">${neu.count} 筆 / ${neuPct}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill neutral" style="width:${neuPct}%"></div></div>
        </div>
        <div class="bar-group">
          <div class="bar-header">
            <span class="color-negative">負向警訊 (Negative)</span>
            <span class="color-white">${neg.count} 筆 / ${negPct}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill negative" style="width:${negPct}%"></div></div>
        </div>
      </div>
      <!-- Sources -->
      <div class="glass-panel sources-panel">
        <h2 class="panel-title"><span class="icon">🌐</span> 數據來源</h2>
        <div class="sources-list">${platformsHtml}</div>
      </div>
    </div>

    <!-- Topics Section -->
    <h2 class="section-title"><span class="icon-grad">🔥</span> 熱議主題風向標</h2>
    <div class="topics-grid">${topicsHtml}</div>

    <!-- AI Insights Bento -->
    <div class="insights-grid">
      <!-- Key Insights -->
      <div class="glass-panel insights-panel">
        <h2 class="panel-title"><span class="icon">🧠</span> AI 深度洞察</h2>
        <div>${insightsHtml}</div>
      </div>
      <!-- Right Column -->
      <div class="right-col">
        <div class="glass-panel competitor-panel">
          <h2 class="panel-title"><span class="icon">🔭</span> 競品動態</h2>
          <div class="prose-sm">${(insights.competitor_analysis || []).map(c => `<p>✧ ${clean(c)}</p>`).join('')}</div>
        </div>
        <div class="glass-panel risk-panel">
          <h2 class="panel-title"><span class="icon">⚠️</span> 風險預警</h2>
          <div class="prose-sm">${(insights.risks || []).map(r => `<p><span class="risk-bullet">▪</span>${clean(r)}</p>`).join('')}</div>
        </div>
      </div>
    </div>

    <!-- Weekly Report Section (conditional) -->
    ${weekly_data ? `
    <div class="weekly-section">
      <h2 class="section-title">
        <span class="icon-grad">📊</span> 本週趨勢週報
        <span style="font-size:0.85rem;font-weight:500;color:#94a3b8;margin-left:0.5rem;">${weekly_data.range}</span>
      </h2>
      <div class="weekly-grid">
        <!-- 聲量與情緒趨勢 -->
        <div class="glass-panel weekly-panel">
          <h3 class="panel-title"><span class="icon">📈</span> 聲量 & 情緒趨勢</h3>
          <div class="weekly-stat-row">
            <span class="weekly-stat-label">本週總聲量</span>
            <span class="weekly-stat-value neutral">${weekly_data.this_total} 筆</span>
          </div>
          <div class="weekly-stat-row">
            <span class="weekly-stat-label">上週總聲量</span>
            <span class="weekly-stat-value neutral">${weekly_data.last_total} 筆</span>
          </div>
          <div class="weekly-stat-row">
            <span class="weekly-stat-label">聲量變化</span>
            <span class="weekly-stat-value ${weekly_data.volume_change >= 0 ? 'up' : 'down'}">${weekly_data.volume_change >= 0 ? '+' : ''}${weekly_data.volume_change} (${weekly_data.volume_pct}%)</span>
          </div>
          <div class="weekly-stat-row">
            <span class="weekly-stat-label">正向輿情</span>
            <span class="weekly-stat-value ${weekly_data.pos_diff >= 0 ? 'up' : 'down'}">${weekly_data.pos_pct}% <small style="opacity:.6">(上週 ${weekly_data.last_pos_pct}%)</small></span>
          </div>
          <div class="weekly-stat-row">
            <span class="weekly-stat-label">中立討論</span>
            <span class="weekly-stat-value neutral">${weekly_data.neu_pct}% <small style="opacity:.6">(上週 ${weekly_data.last_neu_pct}%)</small></span>
          </div>
          <div class="weekly-stat-row">
            <span class="weekly-stat-label">負向警訊</span>
            <span class="weekly-stat-value ${weekly_data.neg_diff <= 0 ? 'up' : 'down'}">${weekly_data.neg_pct}% <small style="opacity:.6">(上週 ${weekly_data.last_neg_pct}%)</small></span>
          </div>
        </div>
        <!-- 本週主題排行 -->
        <div class="glass-panel weekly-panel">
          <h3 class="panel-title"><span class="icon">🏆</span> 本週主題排行</h3>
          <div class="weekly-topic-list">
            ${weekly_data.topics.map((t, i) => `
              <div class="weekly-topic-item">
                <span class="weekly-topic-name">${['🥇','🥈','🥉','4️⃣','5️⃣'][i] || (i+1)+'.'} ${t.topic}</span>
                <span class="weekly-topic-count">${t.count} 筆</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
    ` : ''}

  </div>
</body>
</html>
  `;

  const outputPath = path.join(process.cwd(), `reports/${date}-canva-report-promax.html`);
  fs.writeFileSync(outputPath, html, 'utf8');
  logger.info(`PRO MAX HTML 報告已產生: ${outputPath}`);
  return outputPath;
}

if (process.argv.includes('--test')) {
  const today = new Date().toISOString().split('T')[0];
  const test_date = process.argv[process.argv.indexOf('--test') + 1] || today;
  generate_promax_report(test_date).then(p => {
    console.log(`Open this file in browser: file://${p}`);
    process.exit(0);
  });
}
