// ========================================
// Google 評論蒐集器
// 使用 Playwright 蒐集 Google 上的 Canva 相關公開評論
// v2: 修復選擇器失效問題、加入 Cookie 同意處理
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
        locale: 'zh-TW',
        extraHTTPHeaders: {
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      const page = await context.newPage();
      page.setDefaultTimeout(this.timeout_ms);

      // 先訪問 Google 首頁，處理 Cookie 同意彈窗
      await this.handle_google_consent(page);

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

        await this.sleep(3000); // Google 搜尋需要較長間隔
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
   * 處理 Google Cookie 同意頁面（避免搜尋被攔截）
   * @param {import('playwright').Page} page
   */
  async handle_google_consent(page) {
    try {
      await page.goto('https://www.google.com/?hl=zh-TW', { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });
      await this.sleep(1500);

      // 嘗試點擊各種語言版本的「全部接受」按鈕
      const consent_selectors = [
        'button:has-text("全部接受")',
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        'button:has-text("同意")',
        '#L2AGLb',                        // Google 常用的同意按鈕 ID
        'button[aria-label*="Accept"]',
        'button[aria-label*="接受"]'
      ];

      for (const sel of consent_selectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            logger.debug('[google_reviews] 已處理 Cookie 同意彈窗');
            await this.sleep(1000);
            break;
          }
        } catch {
          // 此選擇器不匹配，繼續嘗試下一個
        }
      }
    } catch (error) {
      logger.debug(`[google_reviews] Cookie 同意處理跳過: ${error.message}`);
    }
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
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbs=qdr:m&hl=zh-TW&gl=tw`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout_ms });

      // 等待搜尋結果載入
      try {
        await page.waitForSelector('#search, #rso, div[data-async-context]', { timeout: 10000 });
      } catch {
        // 繼續嘗試解析，即使等待超時
      }
      await this.sleep(2000);

      // 檢查是否被 reCAPTCHA 攔截
      const page_text = await page.textContent('body').catch(() => '');
      if (page_text.includes('unusual traffic') || page_text.includes('機器人')) {
        throw new Error('Google 偵測到異常流量，需要驗證碼');
      }

      const html = await page.content();
      return this.parse_search_results(html, query);
    }, `Google 搜尋「${query}」`);
  }

  /**
   * 解析 Google 搜尋結果頁面（v2: 更新選擇器）
   * @param {string} html
   * @param {string} query
   * @returns {Object[]}
   */
  parse_search_results(html, query) {
    const $ = cheerio.load(html);
    const results = [];

    // 策略 1: 標準搜尋結果 <div class="g"> 或 data-hveid 容器
    $('div.g').each((i, el) => {
      const item = this.extract_result($, $(el), query);
      if (item) results.push(item);
    });

    // 策略 2: 如果 div.g 找不到，嘗試 #rso 底下的直接子元素
    if (results.length === 0) {
      $('#rso > div').each((i, el) => {
        const item = this.extract_result($, $(el), query);
        if (item) results.push(item);
      });
    }

    // 策略 3: 最後手段 — 從所有含有外部連結的 <a> 標籤提取
    if (results.length === 0) {
      $('a[href^="http"]').each((i, el) => {
        try {
          const $el = $(el);
          const url = $el.attr('href') || '';

          // 排除 Google 自有連結
          if (url.includes('google.com') || url.includes('googleapis.com') || 
              url.includes('gstatic.com') || url.includes('youtube.com')) return;

          // 找 <h3> 標題
          const title = $el.find('h3').text().trim() || $el.text().trim().substring(0, 80);
          if (!title || title.length < 5) return;

          // 只保留跟 Canva 相關的結果
          const parent_text = $el.parent().text().toLowerCase();
          if (!parent_text.includes('canva')) return;

          // 取得摘要（向上查找周圍文字）
          const snippet = $el.closest('div').find('span, div[class]')
            .filter((_, s) => $(s).text().length > 30 && !$(s).find('h3').length)
            .first().text().trim();

          results.push(this.format_item({
            url,
            title,
            content: snippet || title,
            author: this.extract_domain(url),
            published_at: null,
            metadata: {
              search_query: query,
              source_domain: this.extract_domain(url),
              source_type: 'google_search'
            }
          }));
        } catch {
          // 個別解析失敗不影響其他
        }
      });
    }

    return results;
  }

  /**
   * 從單一搜尋結果區塊提取結構化資料
   * @param {import('cheerio').CheerioAPI} $
   * @param {import('cheerio').Cheerio} $el
   * @param {string} query
   * @returns {Object|null}
   */
  extract_result($, $el, query) {
    try {
      // 取得連結
      const link_el = $el.find('a[href^="http"]').first();
      const url = link_el.attr('href');
      if (!url || url.includes('google.com')) return null;

      // 取得標題 — 嘗試多種 <h3> 位置
      const title = $el.find('h3').first().text().trim();
      if (!title) return null;

      // 取得摘要文字 — 更新的選擇器清單
      const snippet_selectors = [
        'div[data-sncf]',       // 新版 Google
        'div.VwiC3b',           // 傳統版
        'span.st',              // 舊版
        'div[style*="-webkit-line-clamp"]',  // CSS clamp 樣式
        'div.IsZvec',           // 另一種容器
        'em'                    // 有時摘要在 <em> 裡
      ];

      let snippet = '';
      for (const sel of snippet_selectors) {
        snippet = $el.find(sel).text().trim();
        if (snippet.length > 20) break;
      }

      // 如果以上都沒抓到，取整個區塊的純文字（去掉標題）
      if (snippet.length < 20) {
        snippet = $el.text().replace(title, '').trim().substring(0, 500);
      }

      // 過濾不相關的結果
      const full_text = `${title} ${snippet}`.toLowerCase();
      if (!full_text.includes('canva')) return null;

      const source_domain = this.extract_domain(url);

      return this.format_item({
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
      });
    } catch {
      return null;
    }
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
