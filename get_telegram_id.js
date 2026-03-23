import 'dotenv/config';

const token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;

if (!token || token.trim() === '') {
    console.log('❌ 錯誤：找不到 TELEGRAM_BOT_TOKEN');
    console.log('請先完成大秘寶步驟 1（向 BotFather 申請機器人）並將 Token 貼上 .env，記得存檔！');
    process.exit(1);
}

async function getChatId() {
    console.log('📡 正在連線到 Telegram 伺服器...');
    console.log(`🔑 取得到的 Token 前綴: ${token.substring(0, 8)}...`);
    console.log('\n⏳ 請現在立刻打開你的 Telegram，找到你剛剛建立的機器人。');
    console.log('💬 對它隨便發送一句話（例如「Hello」）。');
    console.log('（如果你已經傳了，我們馬上就會把它抓出來）\n');

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
        const data = await res.json();

        if (data.ok && data.result.length > 0) {
            // 取出最後一筆訊息
            const lastMsg = data.result[data.result.length - 1].message;
            if (lastMsg) {
                console.log('🎉 抓到你的訊息了！');
                console.log('========================================');
                console.log(`👤 傳訊者名稱: ${lastMsg.from.first_name || lastMsg.from.username}`);
                console.log(`💬 你說的話: ${lastMsg.text || '不是文字'}`);
                console.log(`✅ 你的專屬 TELEGRAM_CHAT_ID 是：${lastMsg.chat.id}`);
                console.log('========================================\n');
                console.log('👇 下一步：');
                console.log(`請把這串數字 [ ${lastMsg.chat.id} ] 複製起來，貼進你的 .env 的 TELEGRAM_CHAT_ID 欄位裡，並按下 Ctrl+S 存檔！`);
            } else {
                console.log('⚠️ 雖然有更新，但是沒看到文字訊息，請傳送一句純文字給機器人！');
            }
        } else if (data.ok && data.result.length === 0) {
            console.log('👀 目前還沒有看到你傳來的任何訊息喔！');
            console.log('請打開 Telegram，按下「Start」或是對它隨便說一句話後，再執行我一次！');
        } else {
            console.error('❌ 取得更新失敗：', data.description);
            if (data.error_code === 401) {
                console.log('可能是你的 Token 複製錯了，請檢查 .env！');
            }
        }
    } catch (err) {
        console.error('連線發生錯誤：', err.message);
    }
}

getChatId();
