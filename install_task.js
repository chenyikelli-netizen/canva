import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const batPath = join(__dirname, 'run_now.bat');

console.log('📌 正在註冊 Windows 工作排程器...');
try {
    const cmd = `schtasks /create /tn "BrandSentinel_DailyReport" /tr "\\"${batPath}\\"" /sc daily /st 10:00 /f`;
    execSync(cmd, { stdio: 'inherit' });
    console.log('✅ 排程註冊成功！系統將在每天早上 10 點自動執行。');
    console.log(`執行路徑已更新為：${batPath}`);
} catch (e) {
    console.error('❌ 排程註冊失敗', e.message);
}
