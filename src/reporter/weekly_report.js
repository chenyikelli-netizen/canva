// ========================================
// 週報 / 月報 生成模組
// 支援補償機制：錯過週日也會在下次開機時自動補發
// 判斷邏輯（方案 B）：
//   若下次觸發（今天 +7 天）會落在下個自然月，
//   則本次發月報（取代週報），否則發週報
// ========================================

import { get_stats, save_report, get_last_weekly_report_date, get_last_monthly_report_date, get_cognitive_log } from '../utils/db.js';
import logger from '../utils/logger.js';

// ========================================
// 核心判斷函式
// ========================================

/**
 * 判斷今天是否為本月最後一次週期性報告觸發
 * 方案 B：若今天 +7 天 > 本月最後一天，則為最後一次
 * @param {Date} today_dt
 * @returns {boolean}
 */
function is_last_trigger_of_month(today_dt) {
  const next_trigger = new Date(today_dt);
  next_trigger.setDate(next_trigger.getDate() + 7);

  // 本月最後一天
  const last_day_of_month = new Date(today_dt.getFullYear(), today_dt.getMonth() + 1, 0);

  return next_trigger > last_day_of_month;
}

/**
 * 判斷今天應觸發哪種週期報告（含補償機制）
 *
 * 觸發條件：距上次週報或月報超過 7 天
 * 觸發類型：
 *   - 'monthly'：今天是本月最後一次觸發機會（方案 B）
 *   - 'weekly' ：其他情況
 *   - null     ：不需觸發
 *
 * @param {string} today - YYYY-MM-DD
 * @returns {{ should: boolean, type: 'weekly'|'monthly'|null, trigger_date: string|null }}
 */
export function should_send_periodic_report(today) {
  const today_dt = new Date(today);

  // 查詢上次週報與月報的發送日期，取最近的一筆
  const last_weekly = get_last_weekly_report_date();
  const last_monthly = get_last_monthly_report_date();

  let last_date = null;
  if (last_weekly && last_monthly) {
    last_date = last_weekly > last_monthly ? last_weekly : last_monthly;
  } else {
    last_date = last_weekly || last_monthly || null;
  }

  // 首次觸發（從未發過任何週/月報）
  if (!last_date) {
    // 今天若是週日（=0），代表沒有完整上週資料，跳過
    if (today_dt.getDay() === 0) {
      return { should: false, type: null, trigger_date: null };
    }
    const type = is_last_trigger_of_month(today_dt) ? 'monthly' : 'weekly';
    logger.info(`📅 首次週期報告觸發，類型：${type}`);
    return { should: true, type, trigger_date: today };
  }

  const last_dt = new Date(last_date);
  const days_since_last = Math.floor((today_dt - last_dt) / (1000 * 60 * 60 * 24));

  if (days_since_last >= 7) {
    const type = is_last_trigger_of_month(today_dt) ? 'monthly' : 'weekly';
    logger.info(`📅 距上次週期報告已 ${days_since_last} 天，觸發補償報告，類型：${type}`);
    return { should: true, type, trigger_date: today };
  }

  return { should: false, type: null, trigger_date: null };
}

// ========================================
// 保留向後相容：舊 import 的 should_send_weekly
// ========================================
export function should_send_weekly(today) {
  const result = should_send_periodic_report(today);
  return { should: result.should, trigger_date: result.trigger_date };
}

// ========================================
// 週報生成
// ========================================

/**
 * 生成週報（本週 vs 上週聲量對比）
 * @param {string} date - 觸發日期 (YYYY-MM-DD)
 * @returns {{ report: string, data: Object }} Markdown 報告 + 結構化資料（供 HTML 渲染）
 */
export function generate_weekly_report(date) {
  logger.info(`開始生成週報（觸發日: ${date}）`);

  const trigger_date = new Date(date);
  const format_date = d => d.toISOString().split('T')[0];
  const pct_str = (count, total) => total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';

  // 找到「上一個完整週」範圍
  const day_of_week = trigger_date.getDay();
  const days_to_last_sunday = day_of_week === 0 ? 7 : day_of_week;

  const this_week_end = new Date(trigger_date);
  this_week_end.setDate(this_week_end.getDate() - days_to_last_sunday);

  const this_week_start = new Date(this_week_end);
  this_week_start.setDate(this_week_start.getDate() - 6);

  const last_week_end = new Date(this_week_start);
  last_week_end.setDate(last_week_end.getDate() - 1);
  const last_week_start = new Date(last_week_end);
  last_week_start.setDate(last_week_start.getDate() - 6);

  const tw = get_stats(format_date(this_week_start), format_date(this_week_end));
  const lw = get_stats(format_date(last_week_start), format_date(last_week_end));

  // 情緒數值
  const tw_pos = tw.by_sentiment.find(s => s.sentiment === '正面')?.count || 0;
  const tw_neu = tw.by_sentiment.find(s => s.sentiment === '中性')?.count || 0;
  const tw_neg = tw.by_sentiment.find(s => s.sentiment === '負面')?.count || 0;
  const lw_pos = lw.by_sentiment.find(s => s.sentiment === '正面')?.count || 0;
  const lw_neu = lw.by_sentiment.find(s => s.sentiment === '中性')?.count || 0;
  const lw_neg = lw.by_sentiment.find(s => s.sentiment === '負面')?.count || 0;

  const volume_change = tw.total - lw.total;
  const volume_pct = lw.total > 0 ? ((volume_change / lw.total) * 100).toFixed(1) : 'N/A';
  const volume_emoji = volume_change > 0 ? '📈' : volume_change < 0 ? '📉' : '➡️';

  const sentiment_compare = build_sentiment_comparison(tw, lw);

  const topic_ranking = tw.by_topic
    .map((t, i) => `  ${i + 1}. ${t.topic} (${t.count} 筆)`)
    .join('\n');

  const report = `
📊 **Canva 品牌週報** — ${format_date(this_week_start)} ~ ${format_date(this_week_end)}

■ 聲量趨勢 ${volume_emoji}
  - 本週: **${tw.total}** 筆 / 上週: **${lw.total}** 筆
  - 變化: ${volume_change >= 0 ? '+' : ''}${volume_change} (${volume_pct}%)

■ 情緒趨勢
${sentiment_compare}

■ 本週主題排行
${topic_ranking || '  (無資料)'}

---
_Brand Sentinel 週報 | 產出時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}_`;

  // 結構化資料供 Pro Max HTML 使用（不需在 index.js 重複計算）
  const data = {
    range: `${format_date(this_week_start)} ~ ${format_date(this_week_end)}`,
    this_total: tw.total,
    last_total: lw.total,
    volume_change,
    volume_pct,
    pos_pct: pct_str(tw_pos, tw.total),
    last_pos_pct: pct_str(lw_pos, lw.total),
    pos_diff: tw_pos - lw_pos,
    neu_pct: pct_str(tw_neu, tw.total),
    last_neu_pct: pct_str(lw_neu, lw.total),
    neg_pct: pct_str(tw_neg, tw.total),
    last_neg_pct: pct_str(lw_neg, lw.total),
    neg_diff: tw_neg - lw_neg,
    topics: tw.by_topic.slice(0, 5)
  };

  try {
    save_report({ report_date: date, report_type: 'weekly', content: report });
  } catch (error) {
    logger.warn(`週報儲存失敗: ${error.message}`);
  }

  // 從 cognitive log 取得本週的信號分佈
  const log_entries = get_cognitive_log(format_date(this_week_start), format_date(this_week_end));
  const signal_dist = { green: 0, yellow: 0, red: 0 };
  log_entries.forEach(e => { const lv = e.investor_signal?.level; if (lv) signal_dist[lv]++; });
  const notable_signals = log_entries
    .filter(e => e.investor_signal?.level && e.investor_signal.level !== 'green')
    .map(e => ({
      date: e.date,
      level: e.investor_signal.level,
      reason: e.investor_signal.reason,
      belief_update: e.cognitive_update?.reason || null
    }));

  return { report, data: { ...data, signal_dist, notable_signals } };
}

// ========================================
// 月報生成
// ========================================

/**
 * 生成月報（取代本月最後一次週報）
 * 資料範圍：觸發日所在自然月的 1 日 ~ 觸發日
 * @param {string} date - 觸發日期 (YYYY-MM-DD)
 * @returns {{ report: string, stats: Object, year_month: string, weeks: Object[] }}
 */
export function generate_monthly_report(date) {
  logger.info(`開始生成月報（觸發日: ${date}）`);

  const trigger_date = new Date(date);
  const year = trigger_date.getFullYear();
  const month = String(trigger_date.getMonth() + 1).padStart(2, '0');
  const year_month = `${year}-${month}`;
  const month_start = `${year_month}-01`;
  const month_end = date; // 到觸發日為止

  const format_date = d => d.toISOString().split('T')[0];

  // 本月完整統計
  const monthly_stats = get_stats(month_start, month_end);

  // 各週分段統計——同時回傳結構化陣列（供 HTML 用）和文字（供 Markdown 用）
  const { text: week_summaries_text, weeks } = build_week_summaries(trigger_date, format_date);

  // 情緒比例
  const total = monthly_stats.total || 1;
  const pct = (sentiment) => {
    const found = monthly_stats.by_sentiment.find(s => s.sentiment === sentiment);
    return found ? ((found.count / total) * 100).toFixed(1) : '0.0';
  };

  const topic_ranking = monthly_stats.by_topic
    .slice(0, 5)
    .map((t, i) => `  ${i + 1}. ${t.topic} (${t.count} 筆)`)
    .join('\n');

  const brand_ranking = monthly_stats.by_brand
    .map(b => {
      const pos_pct = b.count > 0 ? ((b.positive / b.count) * 100).toFixed(0) : '0';
      return `  - **${b.brand}**：${b.count} 筆 | 正向 ${pos_pct}%`;
    })
    .join('\n');

  const report = `
📋 **Canva Brand Sentinel 月報** — ${year_month}
資料範圍：${month_start} ～ ${month_end}（共 ${monthly_stats.total} 筆）

■ 月度情緒概覽
  正面：${pct('正面')}%  |  中立：${pct('中性')}%  |  負面：${pct('負面')}%

■ 品牌聲量分佈
${brand_ranking || '  (無資料)'}

■ 月度主題排行（Top 5）
${topic_ranking || '  (無資料)'}

■ 週次分段摘要
${week_summaries_text}

---
_Brand Sentinel 月報 | 產出時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}_`;

  try {
    save_report({ report_date: date, report_type: 'monthly', content: report });
    logger.info(`✅ 月報已儲存至 DB (${date})`);
  } catch (error) {
    logger.warn(`月報儲存失敗: ${error.message}`);
  }

  // 從 cognitive log 取得本月信號分佈
  const month_log = get_cognitive_log(month_start, month_end);
  const month_signal_dist = { green: 0, yellow: 0, red: 0 };
  month_log.forEach(e => { const lv = e.investor_signal?.level; if (lv) month_signal_dist[lv]++; });

  // 取得各週最顯著的認知更新（優先取紅，其次黃）
  const notable_monthly = [];
  weeks.forEach(w => {
    const week_log = month_log.filter(e => e.date >= w.week_start && e.date <= w.week_end);
    const notable = week_log.find(e => e.investor_signal?.level === 'red')
      || week_log.find(e => e.investor_signal?.level === 'yellow');
    if (notable) notable_monthly.push({
      week_label: `W${w.week_num}`,
      date: notable.date,
      level: notable.investor_signal.level,
      reason: notable.investor_signal.reason,
      belief_update: notable.cognitive_update?.reason || null
    });
  });

  return { report, stats: monthly_stats, year_month, weeks, signal_dist: month_signal_dist, notable_signals: notable_monthly };
}

// ========================================
// 內部工具函式
// ========================================

/**
 * 建立月內各週的統計資料
 * @returns {{ text: string, weeks: Object[] }}
 *   - text：Markdown 字串（月報文字用）
 *   - weeks：結構化陣列（HTML 渲染用）
 */
function build_week_summaries(trigger_date, format_date) {
  const year = trigger_date.getFullYear();
  const month = trigger_date.getMonth();
  const month_start_dt = new Date(year, month, 1);
  const month_end_dt = trigger_date;

  const weeks = [];
  const lines = [];
  let week_num = 1;
  let cursor = new Date(month_start_dt);

  while (cursor <= month_end_dt) {
    const week_start = format_date(cursor);
    const week_end_dt = new Date(cursor);
    week_end_dt.setDate(week_end_dt.getDate() + 6);
    if (week_end_dt > month_end_dt) {
      week_end_dt.setTime(month_end_dt.getTime());
    }
    const week_end = format_date(week_end_dt);
    const stats = get_stats(week_start, week_end);

    if (stats.total > 0) {
      const pos = stats.by_sentiment.find(s => s.sentiment === '正面')?.count || 0;
      const neg = stats.by_sentiment.find(s => s.sentiment === '負面')?.count || 0;
      const pos_pct = ((pos / stats.total) * 100).toFixed(0);
      const neg_pct = ((neg / stats.total) * 100).toFixed(0);

      weeks.push({
        week_num,
        week_start,
        week_end,
        total: stats.total,
        pos_pct,
        neg_pct
      });

      lines.push(
        `  W${week_num}（${week_start} ～ ${week_end}）：` +
        `${stats.total} 筆 | 正向 ${pos_pct}% | 負向 ${neg_pct}%`
      );
    }

    cursor.setDate(cursor.getDate() + 7);
    week_num++;
  }

  return {
    text: lines.join('\n') || '  (無資料)',
    weeks
  };
}

/**
 * 建立情緒對比文字（週報用）
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
