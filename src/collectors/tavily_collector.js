// ========================================
// Tavily 搜尋蒐集器（Phase 2 多品牌 + 國際商務版）
// 使用 Tavily API 搜尋 Canva / Figma / Adobe 相關資訊
// 包含本土輿情 + LinkedIn/Twitter 國際商務搜尋
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
   * 蒐集所有品牌的輿情資料（主品牌 + 競品 + 國際）
   * @returns {Promise<Object[]>}
   */
  async collect() {
    const all_results = [];

    // ============ 階段 A：主品牌（Canva）本土搜尋 ============
    logger.info('[tavily] 📡 階段 A：Canva 本土輿情搜尋');
    const canva_queries = [
      'Canva 評價 PTT Dcard',
      'Canva 新功能 介紹',
      'Canva pro 升級 費用',
      'Canva AI 使用 心得'
    ];

    for (const query of canva_queries) {
      const items = await this.safe_search(query, 'Canva');
      all_results.push(...items);
      await this.sleep(1500);
    }

    // ============ 階段 B：競品本土搜尋 ============
    logger.info('[tavily] ⚔️ 階段 B：競品輿情搜尋');
    for (const competitor of config.collector.competitors) {
      const comp_queries = [
        `${competitor.name} 評價 使用心得`,
        `${competitor.name} vs Canva 比較`
      ];

      for (const query of comp_queries) {
        const items = await this.safe_search(query, competitor.name);
        all_results.push(...items);
        await this.sleep(1500);
      }
    }

    // ============ 階段 C：國際商務搜尋（LinkedIn / Twitter） ============
    logger.info('[tavily] 🌍 階段 C：國際商務輿情搜尋');
    for (const query of config.collector.international_queries) {
      // 從搜尋字串中判斷品牌歸屬
      const brand = this.detect_brand(query);
      const items = await this.safe_search(query, brand);
      all_results.push(...items);
      await this.sleep(1500);
    }

    // 依 URL 去重
    const unique = this.deduplicate(all_results);
    logger.info(`[tavily] 總計蒐集 ${unique.length} 筆不重複資料`);
    return unique.slice(0, this.max_items * 3); // 三品牌，擴大上限
  }

  /**
   * 安全版搜尋（單一查詢失敗不會中斷其他搜尋）
   * @param {string} query - 搜尋關鍵字
   * @param {string} brand - 歸屬品牌
   * @returns {Promise<Object[]>}
   */
  async safe_search(query, brand) {
    try {
      const items = await this.search_tavily(query, brand);
      logger.info(`[tavily] 搜尋「${query}」→ ${brand} 蒐集到 ${items.length} 筆`);
      return items;
    } catch (error) {
      logger.warn(`[tavily] 搜尋關鍵字「${query}」失敗: ${error.message}`);
      return [];
    }
  }

  /**
   * 從搜尋字串中自動偵測品牌歸屬
   * @param {string} query
   * @returns {string}
   */
  detect_brand(query) {
    const q = query.toLowerCase();
    if (q.includes('figma')) return 'Figma';
    if (q.includes('adobe')) return 'Adobe Express';
    return 'Canva';
  }

  /**
   * 執行 Tavily API 搜尋
   * @param {string} query
   * @param {string} brand - 歸屬品牌名稱
   * @returns {Promise<Object[]>}
   */
  async search_tavily(query, brand) {
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
          max_results: 10,
          include_answer: false,
          include_images: false,
          include_raw_content: false
        }),
        signal: AbortSignal.timeout(this.timeout_ms)
      });

      if (!response.ok) {
        const errortext = await response.text();
        throw new Error(`Tavily API 發生錯誤 (${response.status}): ${errortext}`);
      }

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results)) {
        return [];
      }

      // 判斷來源是否為國際商務平台
      const is_international = query.includes('site:linkedin.com') || query.includes('site:twitter.com');

      return data.results.map(item => this.format_item({
        url: item.url,
        title: item.title,
        content: item.content || '(無內容)',
        author: this.extract_domain(item.url),
        published_at: item.published_date || null,
        metadata: {
          search_query: query,
          score: item.score,
          brand: brand,
          source_type: is_international ? 'international' : 'local'
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
