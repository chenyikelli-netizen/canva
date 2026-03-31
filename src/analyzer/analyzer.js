// ========================================
// 分析模組主控
// 批次送入 LLM 做主題分類與情緒分析
// ========================================

import { call_gemini_json } from './llm_client.js';
import { build_analysis_prompt } from './prompt_templates.js';
import { get_unanalyzed_data, insert_analysis, mark_analysis_failed, clear_analysis_failure } from '../utils/db.js';
import logger from '../utils/logger.js';

const BATCH_SIZE = 10; // 每批送入 LLM 的資料數量

/**
 * 分析所有尚未分析的資料（含回收重試的失敗資料）
 * @returns {Promise<{ analyzed: number, failed: number, retried: number }>}
 */
export async function analyze_pending_data() {
  const unanalyzed = get_unanalyzed_data(200);

  if (unanalyzed.length === 0) {
    logger.info('沒有待分析的資料');
    return { analyzed: 0, failed: 0, retried: 0 };
  }

  logger.info(`開始分析 ${unanalyzed.length} 筆資料（每批 ${BATCH_SIZE} 筆）`);

  let analyzed = 0;
  let failed = 0;
  let retried = 0;

  // 分批處理
  for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
    const batch = unanalyzed.slice(i, i + BATCH_SIZE);
    const batch_num = Math.floor(i / BATCH_SIZE) + 1;
    const total_batches = Math.ceil(unanalyzed.length / BATCH_SIZE);

    logger.info(`處理第 ${batch_num}/${total_batches} 批（${batch.length} 筆）`);

    try {
      const results = await analyze_batch(batch);

      // 儲存分析結果
      for (const result of results) {
        try {
          insert_analysis(result);
          // 分析成功 → 清除該筆資料的失敗記錄（若有）
          clear_analysis_failure(result.raw_data_id);
          analyzed++;
        } catch (db_error) {
          logger.warn(`儲存分析結果失敗 (raw_data_id: ${result.raw_data_id}): ${db_error.message}`);
          mark_analysis_failed(result.raw_data_id, `DB 寫入失敗: ${db_error.message}`);
          failed++;
        }
      }

      // 檢查是否有批次中部分項目未被 LLM 回傳（遺漏的項目也需標記失敗）
      const returned_indices = new Set(results.map(r => r.raw_data_id));
      for (const item of batch) {
        if (!returned_indices.has(item.id)) {
          mark_analysis_failed(item.id, 'LLM 未回傳此項目的分析結果');
          failed++;
        }
      }

    } catch (error) {
      // 整批失敗 → 每筆資料都標記失敗，進入回收佇列等下次重試
      logger.error(`第 ${batch_num} 批分析失敗: ${error.message}`);
      for (const item of batch) {
        mark_analysis_failed(item.id, error.message);
      }
      failed += batch.length;
      retried += batch.length;
    }

    // 批次間隔，避免觸發 API 速率限制
    if (i + BATCH_SIZE < unanalyzed.length) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  logger.info(`分析完成：成功 ${analyzed} 筆，失敗 ${failed} 筆，已排入重試 ${retried} 筆`);
  return { analyzed, failed, retried };
}

/**
 * 分析單一批次的資料
 * @param {Object[]} items - 原始資料陣列
 * @returns {Promise<Object[]>} 分析結果陣列
 */
async function analyze_batch(items) {
  const prompt = build_analysis_prompt(items);
  const llm_results = await call_gemini_json(prompt);

  if (!Array.isArray(llm_results)) {
    throw new Error('LLM 回傳的不是陣列格式');
  }

  // 將 LLM 結果對應回原始資料
  return llm_results.map(result => {
    const index = result.index - 1; // LLM 用 1-indexed
    const original = items[index];

    if (!original) {
      logger.warn(`LLM 回傳了不存在的 index: ${result.index}`);
      return null;
    }

    return {
      raw_data_id: original.id,
      brand: result.brand || 'Canva',
      topic: result.topic,
      sentiment: result.sentiment,
      summary: result.summary
    };
  }).filter(Boolean);
}

// 支援獨立測試模式
if (process.argv.includes('--test')) {
  logger.info('🧪 分析模組測試模式');
  analyze_pending_data()
    .then(result => {
      console.log('\n✅ 分析測試完成:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ 分析測試失敗:', error.message);
      process.exit(1);
    });
}
