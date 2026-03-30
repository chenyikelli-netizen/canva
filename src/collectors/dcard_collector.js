// ========================================
// Dcard 蒐集器
// 使用 Playwright 模擬瀏覽器存取 Dcard 搜尋頁面
// （原 API 方式已被 403 封鎖，改用瀏覽器渲染方式）
// ========================================

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import BaseCollector from './base_collector.js';
import logger from '../utils/logger.js';

export default class DcardCollector extends BaseCollector {
  constructor() {
    super('dcard');
    this.search_url = 'https://www.dcard.tw/search';
  }

  /**
   * 蒐集 Dcard 上的 Canva 相關貼文
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
        locale: 'zh-TW',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      const page = await context.newPage();
      page.setDefaultTimeout(this.timeout_ms);

      for (const keyword of this.keywords) {
        try {
          const items = await this.search_keyword(page, keyword);
          all_results.push(...items);
          logger.info(`[dcard] 關鍵字「${keyword}」蒐集到 ${items.length} 筆`);
        } catch (error) {
          logger.warn(`[dcard] 搜尋「${keyword}」失敗: ${error.message}`);
        }

        // 請求間隔，避免觸發速率限制
        await this.sleep(2500);
      }

      await browser.close();
      browser = null;
    } catch (error) {
      logger.error(`[dcard] 瀏覽器操作失敗: ${error.message}`);
      if (browser) await browser.close().catch(() => {});
    }

    // 依 URL 去重
    const unique = this.deduplicate(all_results);
    return unique.slice(0, this.max_items);
  }

  /**
   * 使用 Playwright 搜尋 Dcard 關鍵字
   * @param {import('playwright').Page} page
   * @param {string} keyword
   * @returns {Promise<Object[]>}
   */
  async search_keyword(page, keyword) {
    return this.with_retry(async () => {
      // Dcard 搜尋頁 URL 格式
      const url = `${this.search_url}?query=${encodeURIComponent(keyword)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout_ms });

      // 等待頁面動態內容渲染
      await this.sleep(3000);

      // 向下捲動以載入更多貼文
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await this.sleep(1500);
      }

      const html = await page.content();
      return this.parse_search_results(html, keyword);
    }, `搜尋「${keyword}」`);
  }

  /**
   * 解析 Dcard 搜尋結果頁面 HTML
   * @param {string} html
   * @param {string} keyword
   * @returns {Object[]}
   */
  parse_search_results(html, keyword) {
    const $ = cheerio.load(html);
    const results = [];

    // Dcard 搜尋結果的常見選擇器（Dcard 可能改版，嘗試多種）
    const post_selectors = [
      'article',
      'div[class*="PostEntry"]',
      'a[href*="/f/"][href*="/p/"]',
      'div[data-key]'
    ];

    let posts = $([]);
    for (const selector of post_selectors) {
      posts = $(selector);
      if (posts.length > 0) {
        logger.debug(`[dcard] 使用選擇器: ${selector}，找到 ${posts.length} 個元素`);
        break;
      }
    }

    // 如果結構化選擇器都找不到，嘗試從所有 <a> 連結中提取 Dcard 貼文
    if (posts.length === 0) {
      $('a[href*="/f/"]').each((i, el) => {
        try {
          const $el = $(el);
          const href = $el.attr('href') || '';

          // 只抓 Dcard 貼文連結格式: /f/{forum}/p/{id}
          if (!href.match(/\/f\/\w+\/p\/\d+/)) return;

          const url = href.startsWith('http') ? href : `https://www.dcard.tw${href}`;
          const text = $el.text().trim();

          if (text.length < 10) return;

          results.push(this.format_item({
            url,
            title: text.substring(0, 100),
            content: text.substring(0, 1000),
            author: '匿名',
            published_at: null,
            metadata: {
              keyword,
              source: 'dcard_search_link'
            }
          }));
        } catch (err) {
          // 個別解析失敗不影響其他
        }
      });
      return results;
    }

    // 使用結構化選擇器解析
    posts.each((i, el) => {
      try {
        const $el = $(el);
        const text = $el.text().trim();

        if (text.length < 10) return;

        // 嘗試取得連結
        const link = $el.find('a[href*="/p/"]').attr('href') ||
                     $el.attr('href') || '';
        const url = link ? (link.startsWith('http') ? link : `https://www.dcard.tw${link}`) : null;

        // 如果連結不是 Dcard 貼文格式，跳過
        if (url && !url.includes('dcard.tw')) return;

        // 嘗試取得標題
        const title = $el.find('h2, h3, [class*="title"]').first().text().trim() || 
                      text.substring(0, 80);

        // 嘗試取得看板名稱
        const forum = $el.find('[class*="forum"], [class*="Forum"]').text().trim() || null;

        // 嘗試取得互動數據
        const like_text = $el.find('[class*="like"], [class*="Like"]').text().trim();
        const comment_text = $el.find('[class*="comment"], [class*="Comment"]').text().trim();

        results.push(this.format_item({
          url,
          title,
          content: text.substring(0, 1000),
          author: forum ? `匿名 (${forum})` : '匿名',
          published_at: null,
          metadata: {
            keyword,
            forum,
            like_count: parseInt(like_text) || 0,
            comment_count: parseInt(comment_text) || 0,
            source: 'dcard_search'
          }
        }));
      } catch (err) {
        // 個別解析失敗不影響其他
      }
    });

    return results;
  }

  /**
   * 依 URL 或內容去除重複資料
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
