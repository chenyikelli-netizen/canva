// ========================================
// 蒐集器基底類別
// 定義所有蒐集器的共用介面與行為
// ========================================

import logger from '../utils/logger.js';
import config from '../config.js';

export default class BaseCollector {
  /**
   * @param {string} platform - 平台名稱（threads / dcard / google_reviews）
   */
  constructor(platform) {
    this.platform = platform;
    this.keywords = config.collector.keywords;
    this.timeout_ms = config.collector.timeout_ms;
    this.max_retries = config.collector.max_retries;
    this.retry_delay_ms = config.collector.retry_delay_ms;
    this.max_items = config.collector.max_items_per_source;
  }

  /**
   * 蒐集資料 — 子類別必須實作
   * @returns {Promise<Object[]>} 統一格式的資料陣列
   */
  async collect() {
    throw new Error(`${this.platform} 蒐集器尚未實作 collect() 方法`);
  }

  /**
   * 帶有重試機制的執行器
   * @param {Function} fn - 要執行的非同步函式
   * @param {string} description - 操作描述（用於日誌）
   * @returns {Promise<*>}
   */
  async with_retry(fn, description = '操作') {
    for (let attempt = 1; attempt <= this.max_retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        logger.warn(
          `[${this.platform}] ${description} 第 ${attempt}/${this.max_retries} 次失敗: ${error.message}`
        );
        if (attempt === this.max_retries) {
          logger.error(`[${this.platform}] ${description} 已達最大重試次數，放棄執行`);
          throw error;
        }
        // 指數退避
        const delay = this.retry_delay_ms * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * 格式化蒐集結果為統一結構
   * @param {Object} raw - 原始資料
   * @returns {Object} 統一格式
   */
  format_item(raw) {
    return {
      platform: this.platform,
      url: raw.url || null,
      title: raw.title || null,
      content: raw.content || '',
      author: raw.author || null,
      published_at: raw.published_at || null,
      metadata: raw.metadata || null
    };
  }

  /**
   * 延遲工具函式
   * @param {number} ms - 毫秒數
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 安全執行蒐集流程（含日誌與錯誤處理）
   * @returns {Promise<Object[]>}
   */
  async safe_collect() {
    logger.info(`[${this.platform}] 開始蒐集資料...`);
    const start_time = Date.now();

    try {
      const results = await this.collect();
      const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
      logger.info(`[${this.platform}] 蒐集完成，共 ${results.length} 筆，耗時 ${elapsed}s`);
      return results;
    } catch (error) {
      const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
      logger.error(`[${this.platform}] 蒐集失敗 (${elapsed}s): ${error.message}`, {
        stack: error.stack
      });
      return []; // 單一蒐集器失敗不影響其他蒐集器
    }
  }
}
