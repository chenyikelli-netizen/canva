import fs from 'fs';
import path from 'path';
import config from './src/config.js';
import { send_telegram_message } from './src/notifier/telegram_notifier.js';
import { send_line_message } from './src/notifier/line_notifier.js';

async function sendLatest() {
    console.log('📌 正在從資料庫中讀取最新的分析報告...');
    const dbPath = path.resolve(config.data_dir, 'brand_sentinel.json');
    if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (db.reports && db.reports.length > 0) {
            // 取出最後一筆報告
            const latestReport = db.reports[db.reports.length - 1];
            console.log(`✅ 找到一份報告 (日期: ${latestReport.report_date})，正在同步透過 Telegram 與 LINE 寄出...`);
            
            // 擷取前幾行當摘要引言
            const preview_lines = latestReport.content.split('\n').filter(line => line.trim().length > 0 && !line.includes('==='));
            const summary_preview = preview_lines.slice(2, 8).join('\n');

            const github_url = `https://github.com/chenyikelli-netizen/canva/blob/main/reports/${latestReport.report_date}-canva-report.md`;
            
            const notification_message = `📊 Canva 品牌戰報補發 (${latestReport.report_date})\n\n為了給您最完美的閱讀體驗（含圖表與粗體排版），完整報告已經上傳到資料庫。\n\n👉 點擊立刻閱讀精美版報告：\n${github_url}\n\n---\n⚡ 速覽摘要：\n${summary_preview}\n\n(點擊上方網址看完整競品對照矩陣與重點)`;
            
            const tgSuccess = await send_telegram_message(notification_message);
            const lineSuccess = await send_line_message(notification_message);

            if (tgSuccess && lineSuccess) {
                console.log('🚀 報告已經雙雙成功發送到你的 Telegram 和 LINE！快去看看吧！');
            } else {
                console.log(`❌ 發送狀態檢查：Telegram(${tgSuccess ? '成功':'失敗'}) / LINE(${lineSuccess ? '成功':'失敗'})`);
            }
        } else {
            console.log('❌ 資料庫裡面目前沒有任何已生成好的報告喔！');
        }
    } else {
        console.log('❌ 找不到資料庫檔案！');
    }
}

sendLatest();
