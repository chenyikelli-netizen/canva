import { send_telegram_message } from './src/notifier/telegram_notifier.js';
import { send_line_message } from './src/notifier/line_notifier.js';

const date = new Date().toISOString().split('T')[0];
const github_html_url = `https://htmlpreview.github.io/?https://github.com/chenyikelli-netizen/canva/blob/main/reports/${date}-canva-report-promax.html`;

const notification_message = `✨ 你的 UI/UX Pro Max 戰情面板已上線 (${date})！

因為通訊軟體本身無法直接顯示華麗的互動網頁，我為你打造了完全獨立的 HTML Dashboard 手機友好網頁版！

支援：
🌌 玻璃材質 (Glassmorphism) 與極光動畫
🍱 模塊化佈局 (Bento Grid)
📊 高級情緒數據視覺化漸層引擎

👉 請點擊下方專屬連結，在手機瀏覽器中開啟這份專屬你的戰情大屏吧👇

🌐 ${github_html_url}

(如果一片空白，請多重新整理一兩次讓代理伺服器抓取最新檔案)`;

async function send() {
    console.log('開始發送 Pro Max 網頁版連結...');
    await send_telegram_message(notification_message);
    await send_line_message(notification_message);
    console.log('✅ Pro Max 網頁版通知已發送');
}
send();
