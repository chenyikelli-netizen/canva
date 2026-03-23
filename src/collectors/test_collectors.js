// ========================================
// 蒐集器測試腳本
// 用於獨立驗證各蒐集器是否正常運作
// ========================================

import ThreadsCollector from './threads_collector.js';
import DcardCollector from './dcard_collector.js';
import GoogleReviewsCollector from './google_reviews_collector.js';
import TavilyCollector from './tavily_collector.js';
import logger from '../utils/logger.js';

async function test_collector(name, CollectorClass) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`測試 ${name} 蒐集器`);
  console.log('='.repeat(50));

  try {
    const collector = new CollectorClass();
    const results = await collector.safe_collect();

    console.log(`\n✅ 成功蒐集 ${results.length} 筆資料\n`);

    // 顯示前 3 筆範例
    results.slice(0, 3).forEach((item, i) => {
      console.log(`--- 第 ${i + 1} 筆 ---`);
      console.log(`平台: ${item.platform}`);
      console.log(`標題: ${item.title || '(無標題)'}`);
      console.log(`內容: ${item.content.substring(0, 150)}...`);
      console.log(`連結: ${item.url || '(無連結)'}`);
      console.log(`作者: ${item.author || '(未知)'}`);
      console.log(`發布: ${item.published_at || '(未知)'}`);
      console.log('');
    });

    return results;
  } catch (error) {
    console.log(`\n❌ 測試失敗: ${error.message}`);
    return [];
  }
}

// 根據參數決定測試哪個蒐集器
const target = process.argv[2]; // --threads, --dcard, --google, 或不指定（測試全部）

async function main() {
  console.log('🚀 Canva Brand Sentinel — 蒐集器測試\n');

  if (!target || target === '--dcard') {
    await test_collector('Dcard', DcardCollector);
  }

  if (!target || target === '--threads') {
    await test_collector('Threads', ThreadsCollector);
  }

  if (!target || target === '--google') {
    await test_collector('Google 評論', GoogleReviewsCollector);
  }

  if (!target || target === '--tavily') {
    await test_collector('Tavily 搜尋', TavilyCollector);
  }

  console.log('\n🏁 測試完成');
  process.exit(0);
}

main().catch(error => {
  logger.error('測試腳本執行失敗', { error: error.message });
  process.exit(1);
});
