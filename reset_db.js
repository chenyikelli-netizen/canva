import fs from 'fs';
import path from 'path';
import config from './src/config.js';

const dbPath = path.resolve(config.data_dir, 'brand_sentinel.json');
if (fs.existsSync(dbPath)) {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    // 清除先前模擬的分析結果與報告，讓 Gemini 重新分析
    db.analysis_results = [];
    db.reports = [];
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log('✅ 已清除模擬標籤，準備交給 Gemini 進行真正的大腦分析！');
}
