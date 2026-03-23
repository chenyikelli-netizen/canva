import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const batPath = join(__dirname, 'backup_to_github.bat');

console.log('📌 正在註冊 Windows 凌晨備份排程器...');
try {
    const cmd = `schtasks /create /tn "BrandSentinel_AutoBackup" /tr "\\"${batPath}\\"" /sc daily /st 02:00 /f`;
    execSync(cmd, { stdio: 'inherit' });
    console.log('✅ 備份排程註冊成功！系統將在每天晚上 2 點 (02:00) 自動推送備份至 Github。');
} catch (e) {
    console.error('❌ 備份排程註冊失敗', e.message);
}
