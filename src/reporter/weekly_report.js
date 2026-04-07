// ========================================
// 週報生成模組
// 支援補償機制：錯過週一也會在下次開機時自動補發
// ========================================

import { get_stats, save_report, get_last_weekly_report_date } from '../utils/db.js';
import logger from '../utils/logger.js';

/**
 * 判斷是否應該發送週報（含補償機制）
 * 邏輯：
 *   1. 從未發過週報 → 只要今天不是週日（確保有至少幾天資料），立即觸發
 *   2. 上次週報距今已超過 7 天 → 補償觸發（無論今天是星期幾）
 * @param {string} today - YYYY-MM-DD
 * @returns {{ should: boolean, trigger_date: string|null }}
 */
export function should_send_weekly(today) {
  const last_date = get_last_weekly_report_date();
  const today_dt = new Date(today);

  if (!last_date) {
    // 從未發過週報：只要距上週一已超過0天（即今天是週一或之後），就可以觸發
    // 簡單判斷：今天是週一，或已過了週一（週二~週日且週一沒執行）
    const day_of_week = today_dt.getDay(); // 0=日, 1=一 ... 6=六
    // 只要今天不是週日（沒有完整上週資料），都允許首次觸發
    if (day_of_week !== 0) {
      logger.info('📅 首次週報，觸發發送');
      return { should: true, trigger_date: today };
    }
    return { should: false, trigger_date: null };
  }

  const last_dt = new Date(last_date);
  const days_since_last = Math.floor((today_dt - last_dt) / (1000 * 60 * 60 * 24));

  if (days_since_last >= 7) {
    logger.info(`📅 距上次週報已 ${days_since_last} 天，觸發補償週報`);
    return { should: true, trigger_date: today };
  }

  return { should: false, trigger_date: null };
}

/**
 * 生成週報（本週 vs 上週對比）
 * @param {string} date - 觸發日期 (YYYY-MM-DD)，可以是任意日期
 * @returns {string} Markdown 格式的週報內容
 */
export function generate_weekly_report(date) {
  logger.info(`開始生成週報（觸發日: ${date}）`);

  const trigger_date = new Date(date);

  // 找到「上一個完整週」：從觸發日往前找最近的週日作為本週結束
  const day_of_week = trigger_date.getDay(); // 0=日, 1=一 ... 6=六
  const days_to_last_sunday = day_of_week === 0 ? 7 : day_of_week;

  const this_week_end = new Date(trigger_date);
  this_week_end.setDate(this_week_end.getDate() - days_to_last_sunday);

  const this_week_start = new Date(this_week_end);
  this_week_start.setDate(this_week_start.getDate() - 6);

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
_Brand Sentinel 週報 | 補償發送時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}_`;

  // 儲存週報，記錄發送日期供下次補償判斷使用
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
 * 判斷是否為週一（保留向後相容）
 * @param {string} date - YYYY-MM-DD
 * @returns {boolean}
 */
export function is_monday(date) {
  return new Date(date).getDay() === 1;
}
