// ========================================
// 日報生成模組（Phase 2 多品牌 + 競品對照版）
// 從分析結果生成含競品比較矩陣的 Markdown 日報
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

  // 取得今日統計與分析結果
  const stats = get_stats(date, date);
  const analysis = get_analysis_by_date(date);

  if (stats.total === 0) {
    logger.warn(`${date} 沒有分析資料，生成空報告`);
    return generate_empty_report(date);
  }

  // 取得 LLM 生成的洞察
  let insights = { insights: [], competitor_analysis: [], risks: [] };
  try {
    const top_items = analysis.slice(0, 15); // 取代表性資料
    insights = await call_gemini_json(build_insight_prompt(stats, top_items));
    // 確保欄位存在
    if (!insights.competitor_analysis) insights.competitor_analysis = [];
  } catch (error) {
    logger.warn(`LLM 洞察生成失敗: ${error.message}`);
    insights = { insights: ['（洞察生成失敗，請查看原始資料）'], competitor_analysis: [], risks: [] };
  }

  // 找出熱門主題 TOP 3
  const top_topics = stats.by_topic.slice(0, 3);

  // 為每個熱門主題找代表性原文
  const topic_details = top_topics.map(topic => {
    const topic_items = analysis.filter(a => a.topic === topic.topic);
    const representative = topic_items[0]; // 取第一筆作為代表
    return {
      name: topic.topic,
      count: topic.count,
      summary: representative?.summary || '(無摘要)',
      sample: representative?.content?.substring(0, 100) || '(無內容)'
    };
  });

  // 計算情緒比例
  const total = stats.total;
  const sentiment_pcts = stats.by_sentiment.map(s => ({
    label: s.sentiment,
    count: s.count,
    pct: ((s.count / total) * 100).toFixed(1)
  }));

  // 組裝報告
  const report = build_report_markdown(date, stats, sentiment_pcts, topic_details, insights);

  // 儲存到資料庫
  try {
    save_report({
      report_date: date,
      report_type: 'daily',
      content: report
    });
    logger.info(`日報已儲存: ${date}`);
  } catch (error) {
    logger.warn(`日報儲存失敗: ${error.message}`);
  }

  return report;
}

/**
 * 組裝日報 Markdown（含競品對照矩陣）
 */
function build_report_markdown(date, stats, sentiment_pcts, topic_details, insights) {
  // 平台分布文字
  const platform_dist = stats.by_platform
    .map(p => `${format_platform_name(p.platform)}: ${p.count} 筆`)
    .join(' / ');

  // 情緒分布長條圖
  const sentiment_bar = sentiment_pcts
    .map(s => {
      const bar_len = Math.round(Number(s.pct) / 5);
      const bar = '█'.repeat(bar_len) + '░'.repeat(20 - bar_len);
      return `  ${s.label} ${bar} ${s.pct}%`;
    })
    .join('\n');

  // ===== 競品對照矩陣 =====
  let competitor_matrix = '';
  if (stats.by_brand && stats.by_brand.length > 0) {
    const brand_rows = stats.by_brand.map(b => {
      const total_b = b.count || 1;
      const pos_pct = ((b.positive / total_b) * 100).toFixed(0);
      const neg_pct = ((b.negative / total_b) * 100).toFixed(0);
      const neu_pct = ((b.neutral / total_b) * 100).toFixed(0);
      
      // 正面比例的簡易指標
      const health = Number(pos_pct) >= 60 ? '🟢' : Number(pos_pct) >= 40 ? '🟡' : '🔴';
      
      return `  ${health} ${b.brand}: ${b.count} 筆 | 正面 ${pos_pct}% / 中性 ${neu_pct}% / 負面 ${neg_pct}%`;
    }).join('\n');

    competitor_matrix = `\n■ ⚔️ 競品對照矩陣
${brand_rows}\n`;
  }

  // 熱門主題
  const topics_section = topic_details.map((t, i) => {
    return `  ${i + 1}. **${t.name}** (${t.count} 筆)
     ${t.summary}
     > 「${t.sample}...」`;
  }).join('\n\n');

  // 洞察
  const insights_section = (insights.insights || [])
    .map((insight, i) => `  ${i + 1}. ${insight}`)
    .join('\n');

  // 競品分析洞察
  let competitor_insights_section = '';
  if (insights.competitor_analysis && insights.competitor_analysis.length > 0) {
    competitor_insights_section = `\n■ 🔍 競品觀察
${insights.competitor_analysis.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`;
  }

  // 風險警示
  let risk_section = '';
  if (insights.risks && insights.risks.length > 0) {
    risk_section = `\n■ ⚠️ 風險警示\n${insights.risks.map(r => `  - ${r}`).join('\n')}`;
  }

  return `📊 **Canva 品牌日報** — ${date}

■ 今日摘要
  - 總蒐集筆數: **${stats.total}** 筆
  - 平台分布: ${platform_dist}
  - 情緒分布:
${sentiment_bar}
${competitor_matrix}
■ 熱門主題 TOP ${topic_details.length}
${topics_section}

■ 關鍵洞察
${insights_section}
${competitor_insights_section}
${risk_section}

---
_Brand Sentinel 自動生成 | ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}_`;
}

/**
 * 生成空報告
 */
function generate_empty_report(date) {
  return `📊 **Canva 品牌日報** — ${date}

■ 今日摘要
  - 今日無蒐集資料

---
_Brand Sentinel 自動生成 | ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}_`;
}

/**
 * 格式化平台名稱
 */
function format_platform_name(platform) {
  const names = {
    threads: 'Threads',
    dcard: 'Dcard',
    google_reviews: 'Google 搜尋',
    tavily: 'Tavily 搜尋',
    linkedin: 'LinkedIn',
    twitter: 'Twitter/X'
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
