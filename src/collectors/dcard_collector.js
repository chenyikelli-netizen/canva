// ========================================
// Dcard 蒐集器
// 使用 Dcard 公開搜尋 API 蒐集 Canva 相關貼文
// ========================================

import BaseCollector from './base_collector.js';
import logger from '../utils/logger.js';

export default class DcardCollector extends BaseCollector {
  constructor() {
    super('dcard');
    this.api_base = 'https://www.dcard.tw/service/api/v2';
  }

  /**
   * 蒐集 Dcard 上的 Canva 相關貼文
   * @returns {Promise<Object[]>}
   */
  async collect() {
    const all_results = [];

    for (const keyword of this.keywords) {
      try {
        const items = await this.search_posts(keyword);
        all_results.push(...items);
      } catch (error) {
        logger.warn(`[dcard] 搜尋關鍵字「${keyword}」失敗: ${error.message}`);
      }

      // 請求間隔，避免觸發速率限制
      await this.sleep(1500);
    }

    // 依 URL 去重
    const unique = this.deduplicate(all_results);
    return unique.slice(0, this.max_items);
  }

  /**
   * 搜尋 Dcard 貼文
   * @param {string} keyword - 搜尋關鍵字
   * @returns {Promise<Object[]>}
   */
  async search_posts(keyword) {
    return this.with_retry(async () => {
      const url = `${this.api_base}/search/posts?query=${encodeURIComponent(keyword)}&limit=30`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(this.timeout_ms)
      });

      if (!response.ok) {
        throw new Error(`Dcard API 回應 ${response.status}: ${response.statusText}`);
      }

      const posts = await response.json();

      return posts.map(post => this.format_item({
        url: `https://www.dcard.tw/f/${post.forumAlias}/p/${post.id}`,
        title: post.title || '',
        content: (post.excerpt || post.title || '').substring(0, 1000),
        author: post.forumAlias ? `匿名 (${post.forumAlias})` : '匿名',
        published_at: post.createdAt || null,
        metadata: {
          forum: post.forumAlias,
          like_count: post.likeCount || 0,
          comment_count: post.commentCount || 0,
          gender: post.gender || null
        }
      }));
    }, `搜尋「${keyword}」`);
  }

  /**
   * 依 URL 去除重複資料
   * @param {Object[]} items
   * @returns {Object[]}
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
