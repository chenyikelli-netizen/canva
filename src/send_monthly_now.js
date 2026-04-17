// ========================================
// 手動補發月報
// 用法: node src/send_monthly_now.js
//
// 說明：
//   依照當天日期生成本月月報（1日～今天），
//   並推送至 LINE 和 Telegram。
//   會儲存至 DB，觸發後下次自動判斷將重置計時。
// ========================================

import { generate_monthly_report } from './reporter/weekly_report.js';
import { send_line_message } from './notifier/line_notifier.js';
import { send_telegram_message } from './notifier/telegram_notifier.js';
import { close_db } from './utils/db.js';
import logger from './utils/logger.js';

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

logger.info(`手動補發月報: ${today}`);

const { report, year_month, stats } = generate_monthly_report(today);

console.log(`\n========== 月報內容預覽（${year_month}，共 ${stats.total} 筆） ==========`);
console.log(report);
console.log('===================================================================\n');

const [line_ok, telegram_ok] = await Promise.all([
  send_line_message(report),
  send_telegram_message(report)
]);

console.log(`LINE:     ${line_ok ? '✅ 成功' : '❌ 失敗'}`);
console.log(`Telegram: ${telegram_ok ? '✅ 成功' : '❌ 失敗'}`);

close_db();
process.exit(line_ok || telegram_ok ? 0 : 1);
