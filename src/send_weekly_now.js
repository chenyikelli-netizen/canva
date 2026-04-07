// 手動補發週報
// 用法: node src/send_weekly_now.js

import { generate_weekly_report } from './reporter/weekly_report.js';
import { send_line_message } from './notifier/line_notifier.js';
import { send_telegram_message } from './notifier/telegram_notifier.js';
import logger from './utils/logger.js';

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

logger.info(`手動補發週報: ${today}`);

const weekly = generate_weekly_report(today);

console.log('\n========== 週報內容預覽 ==========');
console.log(weekly);
console.log('===================================\n');

const [line_ok, telegram_ok] = await Promise.all([
  send_line_message(weekly),
  send_telegram_message(weekly)
]);

console.log(`LINE:     ${line_ok ? '✅ 成功' : '❌ 失敗'}`);
console.log(`Telegram: ${telegram_ok ? '✅ 成功' : '❌ 失敗'}`);

process.exit(line_ok || telegram_ok ? 0 : 1);
