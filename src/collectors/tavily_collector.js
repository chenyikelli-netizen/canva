// ========================================
// Tavily 搜尋蒐集器
// 使用 Tavily API 搜尋 Canva 相關的網路討論與新聞
// ========================================

import BaseCollector from './base_collector.js';
import config from '../config.js';
import logger from '../utils/logger.js';

export default class TavilyCollector extends BaseCollector {
  constructor() {
    super('tavily');
    this.api_base = 'https://api.tavily.com/search';
  }

  /**
   * 蒐集網路上的 Canva 相關資訊
   * @returns {Promise<Object[]>}
   */
  async collect() {
    const all_results = [];

    // 設計 Tavily 專用搜尋字詞，包含更多綜合討論與最新動態
    const search_queries = [
      'Canva 評價 PTT Dcard',
      'Canva 新功能 介紹',
      'Canva pro 升級 費用',
      'Canva AI 使用 心得'
    ];

    for (const query of search_queries) {
      try {
        const items = await this.search_tavily(query);
        all_results.push(...items);
        logger.info(`[tavily] 搜尋「${query}」蒐集到 ${items.length} 筆資料`);
      } catch (error) {
        logger.warn(`[tavily] 搜尋關鍵字「${query}」失敗: ${error.message}`);
      }

      // API 請求間隔，減少觸發速率限制
      await this.sleep(1500);
    }

    // 依 URL 去重
    const unique = this.deduplicate(all_results);
    return unique.slice(0, this.max_items); // 控制最多取得的數量
  }

  /**
   * 執行 Tavily API 搜尋
   * @param {string} query
   * @returns {Promise<Object[]>}
   */
  async search_tavily(query) {
    return this.with_retry(async () => {
      const response = await fetch(this.api_base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: config.tavily.api_key,
          query: query,
          search_depth: 'basic',
          max_results: 15,
          include_answer: false,
          include_images: false,
          include_raw_content: false
        }),
        signal: AbortSignal.timeout(this.timeout_ms) // 原生 timeout
      });

      if (!response.ok) {
        const errortext = await response.text();
        throw new Error(`Tavily API 發生錯誤 (${response.status}): ${errortext}`);
      }

      const data = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        return [];
      }

      return data.results.map(item => this.format_item({
        url: item.url,
        title: item.title,
        content: item.content || '(無內容)',
        author: this.extract_domain(item.url),
        published_at: item.published_date || null,
        metadata: {
          search_query: query,
          score: item.score
        }
      }));
    }, `搜尋「${query}」`);
  }

  /**
   * 從 URL 提取來源網域
   * @param {string} url
   */
  extract_domain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * 依 URL 去除重複資料
   */
  deduplicate(items) {
    const seen = new Set();
    return items.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }
}
