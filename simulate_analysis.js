import fs from 'fs';
import path from 'path';
import config from './src/config.js';

const dbPath = path.resolve(config.data_dir, 'brand_sentinel.json');

if (!fs.existsSync(dbPath)) {
    console.error('找不到資料庫檔案');
    process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

let simulatedCount = 0;

for (const item of db.raw_data) {
    // 檢查是否已經存在分析結果
    const exists = db.analysis_results.find(a => a.raw_data_id === item.id);
    if (!exists) {
        const new_id = db.analysis_results.length > 0 ? Math.max(...db.analysis_results.map(r => r.id)) + 1 : 1;
        db.analysis_results.push({
            id: new_id,
            raw_data_id: item.id,
            analyzed_at: new Date().toISOString(),
            topic: config.topic_categories[Math.floor(Math.random() * config.topic_categories.length)],
            sentiment: config.sentiment_labels[Math.floor(Math.random() * config.sentiment_labels.length)],
            summary: "這是由模擬器自動產生的摘要內容，目前 Gemini API 受到限制無法即時生成內容。"
        });
        
        simulatedCount++;
    }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

console.log(`✅ 已成功為 ${simulatedCount} 筆資料寫入模擬分析結果！`);
