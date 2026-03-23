// ========================================
// Threads 蒐集器
// 使用 Playwright 蒐集 Threads 上的 Canva 相關公開貼文
// ========================================

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import BaseCollector from './base_collector.js';
import logger from '../utils/logger.js';

export default class ThreadsCollector extends BaseCollector {
  constructor() {
    super('threads');
    this.search_url = 'https://www.threads.net/search';
  }

  /**
   * 蒐集 Threads 上的 Canva 相關貼文
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

      for (const keyword of this.keywords) {
        try {
          const items = await this.search_keyword(page, keyword);
          all_results.push(...items);
          logger.info(`[threads] 關鍵字「${keyword}」蒐集到 ${items.length} 筆`);
        } catch (error) {
          logger.warn(`[threads] 搜尋「${keyword}」失敗: ${error.message}`);
        }

        await this.sleep(2000);
      }

      await browser.close();
      browser = null;
    } catch (error) {
      logger.error(`[threads] 瀏覽器操作失敗: ${error.message}`);
      if (browser) await browser.close().catch(() => {});
    }

    const unique = this.deduplicate(all_results);
    return unique.slice(0, this.max_items);
  }

  /**
   * 搜尋單一關鍵字
   * @param {import('playwright').Page} page
   * @param {string} keyword
   * @returns {Promise<Object[]>}
   */
  async search_keyword(page, keyword) {
    return this.with_retry(async () => {
      const search_url = `${this.search_url}?q=${encodeURIComponent(keyword)}&serp_type=default`;
      await page.goto(search_url, { waitUntil: 'networkidle', timeout: this.timeout_ms });

      // 等待內容載入
      await this.sleep(3000);

      // 向下捲動以載入更多內容
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await this.sleep(1500);
      }

      const html = await page.content();
      return this.parse_results(html, keyword);
    }, `搜尋「${keyword}」`);
  }

  /**
   * 解析 Threads 搜尋結果頁面
   * @param {string} html - 頁面 HTML
   * @param {string} keyword - 搜尋關鍵字
   * @returns {Object[]}
   */
  parse_results(html, keyword) {
    const $ = cheerio.load(html);
    const results = [];

    // Threads 的 DOM 結構可能變動，嘗試多種選擇器
    // 主要嘗試抓取貼文區塊
    const post_selectors = [
      '[data-pressable-container="true"]',
      'div[class*="post"]',
      'article',
      'div[role="article"]'
    ];

    let posts = $([]);
    for (const selector of post_selectors) {
      posts = $(selector);
      if (posts.length > 0) {
        logger.debug(`[threads] 使用選擇器: ${selector}，找到 ${posts.length} 個元素`);
        break;
      }
    }

    posts.each((i, el) => {
      try {
        const $el = $(el);
        const text = $el.text().trim();

        // 過濾太短或不含關鍵字的內容
        if (text.length < 10) return;
        if (!text.toLowerCase().includes(keyword.toLowerCase())) return;

        // 嘗試取得連結
        const link = $el.find('a[href*="/post/"]').attr('href') ||
                     $el.find('a[href*="/@"]').attr('href') || '';
        const url = link ? (link.startsWith('http') ? link : `https://www.threads.net${link}`) : null;

        // 嘗試取得作者名稱
        const author = $el.find('span[dir="auto"]').first().text().trim() ||
                       $el.find('a[href*="/@"]').text().trim() || null;

        // 嘗試取得時間
        const time_el = $el.find('time');
        const published_at = time_el.attr('datetime') || time_el.text().trim() || null;

        results.push(this.format_item({
          url,
          title: null,
          content: text.substring(0, 1000),
          author,
          published_at,
          metadata: { keyword, source: 'threads_search' }
        }));
      } catch (err) {
        // 個別貼文解析失敗不影響其他
      }
    });

    return results;
  }

  /**
   * 依 URL 或內容去除重複
   * @param {Object[]} items
   * @returns {Object[]}
   */
  deduplicate(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = item.url || item.content.substring(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
