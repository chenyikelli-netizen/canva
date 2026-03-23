import fs from 'fs';
import path from 'path';

try {
  const dbPath = path.resolve('data/brand_sentinel.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const rep = db.reports[db.reports.length - 1];

  if (!rep) {
    console.log('❌ 尚無報告可匯出');
    process.exit(1);
  }

  const d = rep.report_date;
  const content = `---\ndate: ${d}\ntags: [canva, brand-sentinel, report]\n---\n\n${rep.content}`;

  const obsidian_dir = 'C:\\obsidian\\canva';
  if (!fs.existsSync(obsidian_dir)) {
    fs.mkdirSync(obsidian_dir, { recursive: true });
  }

  const file_path = path.join(obsidian_dir, `${d} Canva輿情監視報告.md`);
  fs.writeFileSync(file_path, content, 'utf8');

  console.log(`✅ 已手動匯出今日報告至 Obsidian: ${file_path}`);
} catch (e) {
  console.error('❌ 匯出失敗:', e.message);
}
