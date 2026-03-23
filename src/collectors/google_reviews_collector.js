// ========================================
// Google 評論蒐集器
// 使用 Playwright 蒐集 Google 上的 Canva 相關公開評論
// ========================================

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import BaseCollector from './base_collector.js';
import logger from '../utils/logger.js';

export default class GoogleReviewsCollector extends BaseCollector {
  constructor() {
    super('google_reviews');
  }

  /**
   * 蒐集 Google 上的 Canva 相關評論與討論
   * @returns {Promise<Object[]>}
   */
  async collect() {
    const all_results = [];
    let browser = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'zh-TW'
      });

      const page = await context.newPage();
      page.setDefaultTimeout(this.timeout_ms);

      // 搜尋策略：用不同的搜尋詞組合蒐集 Google 上的公開評論與討論
      const search_queries = [
        'Canva 評價 心得',
        'Canva 推薦 好用嗎',
        'Canva AI 使用心得',
        'Canva Pro 值得嗎',
        'Canva 缺點 問題'
      ];

      for (const query of search_queries) {
        try {
          const items = await this.search_google(page, query);
          all_results.push(...items);
          logger.info(`[google_reviews] 搜尋「${query}」蒐集到 ${items.length} 筆`);
        } catch (error) {
          logger.warn(`[google_reviews] 搜尋「${query}」失敗: ${error.message}`);
        }

        await this.sleep(2500); // Google 搜尋需要較長間隔
      }

      await browser.close();
      browser = null;
    } catch (error) {
      logger.error(`[google_reviews] 瀏覽器操作失敗: ${error.message}`);
      if (browser) await browser.close().catch(() => {});
    }

    const unique = this.deduplicate(all_results);
    return unique.slice(0, this.max_items);
  }

  /**
   * Google 搜尋並解析結果
   * @param {import('playwright').Page} page
   * @param {string} query
   * @returns {Promise<Object[]>}
   */
  async search_google(page, query) {
    return this.with_retry(async () => {
      // 限定最近一個月的結果
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbs=qdr:m&hl=zh-TW`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout_ms });

      await this.sleep(2000);

      const html = await page.content();
      return this.parse_search_results(html, query);
    }, `Google 搜尋「${query}」`);
  }

  /**
   * 解析 Google 搜尋結果頁面
   * @param {string} html
   * @param {string} query
   * @returns {Object[]}
   */
  parse_search_results(html, query) {
    const $ = cheerio.load(html);
    const results = [];

    // Google 搜尋結果的主要容器
    const search_results = $('div.g, div[data-hveid]');

    search_results.each((i, el) => {
      try {
        const $el = $(el);

        // 取得連結
        const link_el = $el.find('a[href^="http"]').first();
        const url = link_el.attr('href');
        if (!url || url.includes('google.com')) return;

        // 取得標題
        const title = $el.find('h3').first().text().trim();
        if (!title) return;

        // 取得摘要文字
        const snippet = $el.find('div[data-sncf], div.VwiC3b, span.st, div[style*="line"]')
          .text().trim();

        // 過濾不相關的結果
        const full_text = `${title} ${snippet}`.toLowerCase();
        if (!full_text.includes('canva')) return;

        // 判斷來源平台
        const source_domain = this.extract_domain(url);

        results.push(this.format_item({
          url,
          title,
          content: snippet || title,
          author: source_domain,
          published_at: null,
          metadata: {
            search_query: query,
            source_domain,
            source_type: 'google_search'
          }
        }));
      } catch (err) {
        // 個別結果解析失敗不影響其他
      }
    });

    return results;
  }

  /**
   * 從 URL 提取網域名稱
   * @param {string} url
   * @returns {string}
   */
  extract_domain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * 依 URL 去除重複
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
