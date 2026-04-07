// ========================================
// 單獨推送今日 Pro Max 報告連結
// 用法: node src/send_today.js
// ========================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { send_line_message } from './notifier/line_notifier.js';
import { send_telegram_message } from './notifier/telegram_notifier.js';
import { get_stats } from './utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

// 確認今日報告存在
const report_path = path.join(__dirname, '..', 'reports', `${today}-canva-report-promax.html`);
if (!fs.existsSync(report_path)) {
  console.error(`❌ 找不到今日報告: ${report_path}`);
  process.exit(1);
}

// 取得今日基本統計
const stats = get_stats(today, today);
const total = stats.total;
const pos = stats.by_sentiment.find(s => s.sentiment === '正面') || { count: 0 };
const posPct = total > 0 ? ((pos.count / total) * 100).toFixed(1) : '0.0';
const health = parseFloat(posPct) >= 60 ? '🟢 良好' : '🟡 留意';

const github_html_url = `https://htmlpreview.github.io/?https://github.com/chenyikelli-netizen/canva/blob/main/reports/${today}-canva-report-promax.html`;

const notification_message = `✨ 你的 UI/UX Pro Max 戰情面板已上線 (${today})！

通訊軟體本身無法直接顯示華麗的互動網頁，我為你打造了完全獨立的 HTML Dashboard 手機友好網頁版！
支援玻璃材質 (Glassmorphism)、模塊化佈局與高級數據漸層視覺化。

👉 請點擊下方專屬連結，在手機瀏覽器中開啟這份專屬你的戰情大屏👇
🌐 ${github_html_url}

---
⚡ 今日速覽摘要：
📊 總聲量：${total} 筆
💚 正向輿情：${pos.count} 筆 (${posPct}%)
🏥 品牌健康度：${health}`;

console.log('📤 正在發送今日報告連結...');
console.log(`   日期：${today}`);
console.log(`   URL：${github_html_url}\n`);

const [line_ok, telegram_ok] = await Promise.all([
  send_line_message(notification_message),
  send_telegram_message(notification_message)
]);

console.log(`LINE:     ${line_ok ? '✅ 成功' : '❌ 失敗'}`);
console.log(`Telegram: ${telegram_ok ? '✅ 成功' : '❌ 失敗'}`);

process.exit(line_ok || telegram_ok ? 0 : 1);
