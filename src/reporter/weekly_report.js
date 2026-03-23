// ========================================
// 週報生成模組
// 每週一附加在日報之後，提供週趨勢對比
// ========================================

import { get_stats, save_report } from '../utils/db.js';
import logger from '../utils/logger.js';

/**
 * 生成週報（本週 vs 上週對比）
 * @param {string} date - 當天日期 (YYYY-MM-DD)，必須是週一
 * @returns {string} Markdown 格式的週報內容
 */
export function generate_weekly_report(date) {
  logger.info(`開始生成週報: ${date}`);

  const report_date = new Date(date);

  // 本週範圍（上週一 ~ 上週日）
  const this_week_end = new Date(report_date);
  this_week_end.setDate(this_week_end.getDate() - 1); // 上週日
  const this_week_start = new Date(this_week_end);
  this_week_start.setDate(this_week_start.getDate() - 6); // 上週一

  // 上上週範圍
  const last_week_end = new Date(this_week_start);
  last_week_end.setDate(last_week_end.getDate() - 1);
  const last_week_start = new Date(last_week_end);
  last_week_start.setDate(last_week_start.getDate() - 6);

  const format_date = (d) => d.toISOString().split('T')[0];

  const this_week_stats = get_stats(format_date(this_week_start), format_date(this_week_end));
  const last_week_stats = get_stats(format_date(last_week_start), format_date(last_week_end));

  // 聲量變化
  const volume_change = this_week_stats.total - last_week_stats.total;
  const volume_pct = last_week_stats.total > 0
    ? ((volume_change / last_week_stats.total) * 100).toFixed(1)
    : 'N/A';
  const volume_emoji = volume_change > 0 ? '📈' : volume_change < 0 ? '📉' : '➡️';

  // 情緒變化對比
  const sentiment_compare = build_sentiment_comparison(this_week_stats, last_week_stats);

  // 主題排行
  const topic_ranking = this_week_stats.by_topic
    .map((t, i) => `  ${i + 1}. ${t.topic} (${t.count} 筆)`)
    .join('\n');

  const report = `
📊 **Canva 品牌週報** — ${format_date(this_week_start)} ~ ${format_date(this_week_end)}

■ 聲量趨勢 ${volume_emoji}
  - 本週: **${this_week_stats.total}** 筆 / 上週: **${last_week_stats.total}** 筆
  - 變化: ${volume_change >= 0 ? '+' : ''}${volume_change} (${volume_pct}%)

■ 情緒趨勢
${sentiment_compare}

■ 本週主題排行
${topic_ranking || '  (無資料)'}

---
_Brand Sentinel 週報 | ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}_`;

  // 儲存週報
  try {
    save_report({
      report_date: date,
      report_type: 'weekly',
      content: report
    });
  } catch (error) {
    logger.warn(`週報儲存失敗: ${error.message}`);
  }

  return report;
}

/**
 * 建立情緒對比文字
 */
function build_sentiment_comparison(this_week, last_week) {
  const labels = ['正面', '中性', '負面'];

  return labels.map(label => {
    const this_count = this_week.by_sentiment.find(s => s.sentiment === label)?.count || 0;
    const last_count = last_week.by_sentiment.find(s => s.sentiment === label)?.count || 0;

    const this_pct = this_week.total > 0 ? ((this_count / this_week.total) * 100).toFixed(1) : '0.0';
    const last_pct = last_week.total > 0 ? ((last_count / last_week.total) * 100).toFixed(1) : '0.0';

    const diff = (Number(this_pct) - Number(last_pct)).toFixed(1);
    const arrow = Number(diff) > 0 ? '↑' : Number(diff) < 0 ? '↓' : '→';

    return `  ${label}: ${this_pct}% (上週 ${last_pct}%) ${arrow}${Math.abs(diff)}%`;
  }).join('\n');
}

/**
 * 判斷是否為週一
 * @param {string} date - YYYY-MM-DD
 * @returns {boolean}
 */
export function is_monday(date) {
  return new Date(date).getDay() === 1;
}
