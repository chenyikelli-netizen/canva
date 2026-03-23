// ========================================
// Canva Brand Sentinel — 主程式入口
// 排程器 + 全流程串接
// ========================================

import cron from 'node-cron';
import config from './config.js';
import logger from './utils/logger.js';
import { insert_raw_data_batch, close_db } from './utils/db.js';

// 蒐集器
import ThreadsCollector from './collectors/threads_collector.js';
import DcardCollector from './collectors/dcard_collector.js';
import GoogleReviewsCollector from './collectors/google_reviews_collector.js';
import TavilyCollector from './collectors/tavily_collector.js';

// 分析器
import { analyze_pending_data } from './analyzer/analyzer.js';

// 報告
import { generate_daily_report } from './reporter/daily_report.js';
import { generate_weekly_report, is_monday } from './reporter/weekly_report.js';

// 通知
import { send_line_message } from './notifier/line_notifier.js';
import { send_telegram_message } from './notifier/telegram_notifier.js';

/**
 * 執行完整的輿情監控流程
 * 蒐集 → 分析 → 報告 → 通知
 */
async function run_pipeline() {
  const start_time = Date.now();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD

  logger.info('========================================');
  logger.info(`🚀 開始執行品牌輿情監控流程: ${today}`);
  logger.info('========================================');

  try {
    // ============ Phase 1: 資料蒐集 ============
    logger.info('📡 Phase 1: 資料蒐集');

    const collectors = [
      new TavilyCollector(),
      new DcardCollector(),
      new ThreadsCollector(),
      new GoogleReviewsCollector()
    ];

    let total_collected = 0;

    for (const collector of collectors) {
      const results = await collector.safe_collect();

      if (results.length > 0) {
        const { inserted, skipped } = insert_raw_data_batch(results);
        total_collected += inserted;
        logger.info(`[${collector.platform}] 新增 ${inserted} 筆，跳過 ${skipped} 筆重複`);
      }
    }

    logger.info(`📡 蒐集階段完成，共新增 ${total_collected} 筆資料`);

    // ============ Phase 2: LLM 分析 ============
    logger.info('🧠 Phase 2: LLM 分析');

    const analysis_result = await analyze_pending_data();
    logger.info(`🧠 分析完成: 成功 ${analysis_result.analyzed}，失敗 ${analysis_result.failed}`);

    // ============ Phase 3: 報告生成 ============
    logger.info('📝 Phase 3: 報告生成');

    let report = await generate_daily_report(today);

    // 若為週一，附加週報
    if (is_monday(today)) {
      logger.info('📅 今天是週一，附加週報');
      const weekly = generate_weekly_report(today);
      report += '\n\n' + weekly;
    }

    logger.info('📝 報告生成完成');

    // 在終端機畫面上直接印出報告預覽
    console.log('\n========================================');
    console.log(report);
    console.log('========================================\n');

    // ============ Phase 4: 通知推送 ============
    logger.info('📤 Phase 4: 通知推送');

    // LINE 推送（主要）
    const line_ok = await send_line_message(report);

    // Telegram 推送（備援，或同時推送）
    const telegram_ok = await send_telegram_message(report);

    if (!line_ok && !telegram_ok) {
      logger.error('⚠️ LINE 和 Telegram 推送都失敗！');
    } else {
      logger.info(`📤 推送完成 — LINE: ${line_ok ? '✅' : '❌'} | Telegram: ${telegram_ok ? '✅' : '❌'}`);
    }

    // ============ 完成 ============
    const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
    logger.info(`✅ 全流程完成，耗時 ${elapsed} 秒`);

  } catch (error) {
    logger.error(`❌ 流程執行失敗: ${error.message}`, { stack: error.stack });
  }
}

// ========================================
// 啟動模式判斷
// ========================================

const args = process.argv.slice(2);

if (args.includes('--now')) {
  // 手動立即執行模式
  logger.info('🔧 手動觸發模式');
  run_pipeline()
    .then(() => {
      close_db();
      process.exit(0);
    })
    .catch(error => {
      logger.error('手動執行失敗:', { error: error.message });
      close_db();
      process.exit(1);
    });
} else {
  // 排程模式
  const { cron_expression, timezone } = config.schedule;

  logger.info(`⏰ Brand Sentinel 排程模式啟動`);
  logger.info(`   排程: ${cron_expression} (${timezone})`);
  logger.info(`   下次執行: 每日 09:00 (UTC+8)`);
  logger.info(`   按 Ctrl+C 停止`);

  cron.schedule(cron_expression, () => {
    run_pipeline().catch(error => {
      logger.error('排程執行失敗:', { error: error.message });
    });
  }, {
    timezone: timezone
  });

  // 優雅關閉
  process.on('SIGINT', () => {
    logger.info('收到停止信號，正在關閉...');
    close_db();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('收到終止信號，正在關閉...');
    close_db();
    process.exit(0);
  });
}
