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

export async function generate_promax_report(date) {
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
    <div class="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
      <span class="text-slate-300 font-medium capitalize">${p.platform}</span>
      <span class="text-white font-bold bg-[#8B3CF7]/30 px-3 py-1 rounded-full text-sm">${p.count}</span>
    </div>
  `).join('');

  // 渲染主題區塊
  const topicsHtml = topic_details.map((t, i) => `
    <div class="p-5 rounded-3xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 hover:-translate-y-1 transition-transform cursor-pointer">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-bold text-white flex items-center gap-2">
          <span class="text-2xl">${['🥇', '🥈', '🥉'][i] || '📌'}</span> ${t.name}
        </h3>
        <span class="text-xs font-semibold text-[#00C4CC] bg-[#00C4CC]/20 px-2 py-1 rounded-lg">${t.count} 筆</span>
      </div>
      <p class="text-slate-300 text-sm mb-3 font-medium leading-relaxed">${t.summary}</p>
      <div class="p-3 bg-black/40 rounded-xl border border-white/5">
        <p class="text-slate-400 text-xs italic">「${t.sample}…」</p>
      </div>
    </div>
  `).join('');

  // 渲染洞察區塊
  const clean = str => str.replace(/^[-*0-9.\\s]+/, '');
  const insightsHtml = (insights.insights || []).map((s, i) => `
    <div class="flex gap-4 p-4 hover:bg-white/5 rounded-2xl transition-colors">
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold border border-indigo-500/30">${i+1}</div>
      <p class="text-slate-200 text-sm leading-relaxed">${clean(s)}</p>
    </div>
  `).join('');

  const html = `
<!DOCTYPE html>
<html lang="zh-TW" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brand Sentinel - UI/UX Pro Max</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #020617; }
    .glass-panel {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .aurora-bg {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: -1; overflow: hidden;
    }
    .blob {
      position: absolute; filter: blur(90px); border-radius: 50%; opacity: 0.5; animation: float 10s infinite ease-in-out alternate;
    }
    @keyframes float { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(30px, -50px) scale(1.1); } }
    .blob-1 { top: -10%; left: -10%; width: 50vw; height: 50vw; background: radial-gradient(circle, #8B3CF7 0%, transparent 70%); }
    .blob-2 { bottom: -20%; right: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, #00C4CC 0%, transparent 70%); animation-delay: -5s; }
  </style>
</head>
<body class="text-slate-100 min-h-screen selection:bg-[#8B3CF7] selection:text-white pb-20">

  <!-- Aurora Background Effects -->
  <div class="aurora-bg">
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
  </div>

  <div class="max-w-6xl mx-auto px-6 pt-16">
    <!-- Header -->
    <header class="flex flex-col md:flex-row items-center justify-between mb-16 gap-6">
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs font-bold tracking-wider text-[#00C4CC] uppercase mb-4">
          <span class="w-2 h-2 rounded-full bg-[#00C4CC] animate-pulse"></span>
          Live Monitoring Active
        </div>
        <h1 class="text-4xl md:text-6xl font-extrabold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-500">
          Brand Sentinel
        </h1>
        <p class="text-slate-400 text-lg">Canva 品牌輿情分析戰情室 ｜ <span class="text-white font-medium">${date}</span></p>
      </div>
      
      <div class="glass-panel p-6 rounded-3xl flex items-center gap-6">
        <div>
          <p class="text-slate-400 text-sm mb-1">今日總聲量</p>
          <p class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#8B3CF7] to-[#00C4CC]">${total}</p>
        </div>
        <div class="h-12 w-px bg-white/10"></div>
        <div>
          <p class="text-slate-400 text-sm mb-1">品牌健康度</p>
          <p class="text-2xl font-bold ${posPct >= 60 ? 'text-emerald-400' : 'text-amber-400'} flex items-center gap-2">
            ${posPct >= 60 ? '🟢 良好' : '🟡 留意'}
          </p>
        </div>
      </div>
    </header>

    <!-- Bento Grid Layout -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6">
      
      <!-- Sentiment Overview (Span 8) -->
      <div class="md:col-span-8 glass-panel rounded-3xl p-8 relative overflow-hidden group">
        <div class="absolute top-0 right-0 w-64 h-64 bg-[#8B3CF7]/10 rounded-full filter blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <h2 class="text-2xl font-bold mb-8 flex items-center gap-3">
          <span class="bg-white/10 p-2 rounded-xl">📊</span> 情緒健康矩陣
        </h2>
        
        <div class="space-y-6 relative z-10">
          <!-- Positive -->
          <div>
            <div class="flex justify-between text-sm font-semibold mb-2">
              <span class="text-emerald-400">正向輿情 (Positive)</span>
              <span class="text-white">${pos.count} 筆 / ${posPct}%</span>
            </div>
            <div class="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full" style="width: ${posPct}%"></div>
            </div>
          </div>
          <!-- Neutral -->
          <div>
            <div class="flex justify-between text-sm font-semibold mb-2">
              <span class="text-amber-400">中立討論 (Neutral)</span>
              <span class="text-white">${neu.count} 筆 / ${neuPct}%</span>
            </div>
            <div class="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" style="width: ${neuPct}%"></div>
            </div>
          </div>
          <!-- Negative -->
          <div>
            <div class="flex justify-between text-sm font-semibold mb-2">
              <span class="text-rose-400">負向警訊 (Negative)</span>
              <span class="text-white">${neg.count} 筆 / ${negPct}%</span>
            </div>
            <div class="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-rose-500 to-rose-300 rounded-full" style="width: ${negPct}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sources (Span 4) -->
      <div class="md:col-span-4 glass-panel rounded-3xl p-8 flex flex-col">
        <h2 class="text-xl font-bold mb-6 flex items-center gap-3">
          <span class="bg-white/10 p-2 rounded-xl">🌐</span> 數據來源
        </h2>
        <div class="flex-grow flex flex-col justify-center space-y-3">
          ${platformsHtml}
        </div>
      </div>
    </div>

    <!-- Topics Grid -->
    <h2 class="text-2xl font-bold mb-6 mt-12 flex items-center gap-3">
      <span class="bg-gradient-to-br from-[#8B3CF7] to-[#00C4CC] p-2 rounded-xl text-white">🔥</span> 熱議主題風向標
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
      ${topicsHtml}
    </div>

    <!-- AI Insights Bento -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      <!-- Key Insights -->
      <div class="glass-panel rounded-3xl p-8">
        <h2 class="text-2xl font-bold mb-6 flex items-center gap-3 text-indigo-300">
          <span class="bg-indigo-500/20 p-2 rounded-xl">🧠</span> AI 深度洞察
        </h2>
        <div class="space-y-2">
          ${insightsHtml}
        </div>
      </div>

      <!-- Risks & Competitors -->
      <div class="space-y-6 flex flex-col">
        <!-- Competitor -->
        <div class="glass-panel rounded-3xl p-8 flex-1">
          <h2 class="text-xl font-bold mb-4 flex items-center gap-3 text-cyan-300">
            <span class="bg-cyan-500/20 p-2 rounded-xl">🔭</span> 競品動態
          </h2>
          <div class="text-slate-300 text-sm leading-relaxed space-y-4">
            ${(insights.competitor_analysis || []).map(c => `<p>✧ ${clean(c)}</p>`).join('')}
          </div>
        </div>
        
        <!-- Risks -->
        <div class="glass-panel rounded-3xl p-8 flex-1 border-rose-500/20 bg-rose-500/5">
          <h2 class="text-xl font-bold mb-4 flex items-center gap-3 text-rose-300">
            <span class="bg-rose-500/20 p-2 rounded-xl">⚠️</span> 風險預警
          </h2>
          <div class="text-slate-300 text-sm leading-relaxed space-y-4">
            ${(insights.risks || []).map(r => `<p class="flex gap-2"><span class="text-rose-500">▪</span> ${clean(r)}</p>`).join('')}
          </div>
        </div>
      </div>

    </div>

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
