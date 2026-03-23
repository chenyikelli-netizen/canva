// ========================================
// 資料儲存模組 (JSON 版)
// 使用 JSON 檔案儲存蒐集的原始資料與分析結果
// ========================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import config from '../config.js';
import logger from './logger.js';

// 確保 data 目錄存在
if (!existsSync(config.data_dir)) {
  mkdirSync(config.data_dir, { recursive: true });
}

const DB_PATH = resolve(config.data_dir, 'brand_sentinel.json');

// 在記憶體中維護資料
let db = {
  raw_data: [],
  analysis_results: [],
  reports: []
};

// 載入資料庫
function load_db() {
  try {
    if (existsSync(DB_PATH)) {
      const content = readFileSync(DB_PATH, 'utf8');
      db = JSON.parse(content);
      logger.info('資料庫載入完成', { path: DB_PATH });
    } else {
      save_db();
      logger.info('建立新資料庫', { path: DB_PATH });
    }
  } catch (err) {
    logger.error(`讀取資料庫失敗: ${err.message}`);
  }
}

// 儲存至實體檔案
function save_db() {
  try {
    writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    logger.error(`寫入資料庫失敗: ${err.message}`);
  }
}

// 初始化
load_db();

// ========================================
// 資料操作函式
// ========================================

/**
 * 插入原始蒐集資料（自動忽略重複）
 * @param {Object} data 
 * @returns {number|null}
 */
export function insert_raw_data(data) {
  // 檢查重複
  const exists = db.raw_data.find(r => r.platform === data.platform && r.url === data.url);
  if (exists && data.url) return null;

  const new_id = db.raw_data.length > 0 ? Math.max(...db.raw_data.map(r => r.id)) + 1 : 1;
  const now = new Date().toISOString();
  
  db.raw_data.push({
    id: new_id,
    platform: data.platform,
    url: data.url || null,
    title: data.title || null,
    content: data.content,
    author: data.author || null,
    published_at: data.published_at || null,
    collected_at: now,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null
  });
  
  save_db();
  return new_id;
}

/**
 * 批次插入原始資料
 * @param {Object[]} items 
 * @returns {{ inserted: number, skipped: number }}
 */
export function insert_raw_data_batch(items) {
  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const id = insert_raw_data(item);
    if (id) inserted++;
    else skipped++;
  }

  // insert_raw_data 內部已呼叫 save_db
  return { inserted, skipped };
}

/**
 * 插入分析結果
 * @param {Object} result 
 */
export function insert_analysis(result) {
  const new_id = db.analysis_results.length > 0 ? Math.max(...db.analysis_results.map(r => r.id)) + 1 : 1;
  const now = new Date().toISOString();
  
  db.analysis_results.push({
    id: new_id,
    raw_data_id: result.raw_data_id,
    brand: result.brand || 'Canva',
    topic: result.topic,
    sentiment: result.sentiment,
    summary: result.summary || null,
    analyzed_at: now
  });
  
  save_db();
  return new_id;
}

/**
 * 取得尚未分析的原始資料
 * @param {number} limit 
 * @returns {Object[]}
 */
export function get_unanalyzed_data(limit = 100) {
  const analyzed_ids = new Set(db.analysis_results.map(a => a.raw_data_id));
  const unanalyzed = db.raw_data
    .filter(r => !analyzed_ids.has(r.id))
    .sort((a, b) => new Date(b.collected_at) - new Date(a.collected_at));
    
  return unanalyzed.slice(0, limit);
}

/**
 * 取得指定日期的分析結果（用於生成報告）
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Object[]}
 */
export function get_analysis_by_date(date) {
  return db.analysis_results
    .filter(a => a.analyzed_at.startsWith(date))
    .map(a => {
      const raw = db.raw_data.find(r => r.id === a.raw_data_id) || {};
      return { 
        ...a, 
        brand: a.brand || 'Canva',
        platform: raw.platform, 
        url: raw.url, 
        title: raw.title, 
        content: raw.content, 
        author: raw.author, 
        published_at: raw.published_at 
      };
    })
    .sort((a, b) => new Date(b.analyzed_at) - new Date(a.analyzed_at));
}

/**
 * 取得指定日期範圍的統計資訊
 * @param {string} start_date 
 * @param {string} end_date 
 * @returns {Object}
 */
export function get_stats(start_date, end_date) {
  // ISO string is YYYY-MM-DDTHH:mm... so we can do string comparison for date part
  const in_range = db.analysis_results.filter(a => {
    const d = a.analyzed_at.split('T')[0];
    return d >= start_date && d <= end_date;
  });

  const total = in_range.length;

  const platform_counts = {};
  const topic_counts = {};
  const sentiment_counts = {};
  const brand_data = {}; // 品牌維度統計

  in_range.forEach(a => {
    const raw = db.raw_data.find(r => r.id === a.raw_data_id);
    const platform = raw ? raw.platform : 'unknown';
    const brand = a.brand || 'Canva';
    
    platform_counts[platform] = (platform_counts[platform] || 0) + 1;
    topic_counts[a.topic] = (topic_counts[a.topic] || 0) + 1;
    sentiment_counts[a.sentiment] = (sentiment_counts[a.sentiment] || 0) + 1;

    // 品牌維度統計
    if (!brand_data[brand]) {
      brand_data[brand] = { count: 0, positive: 0, neutral: 0, negative: 0 };
    }
    brand_data[brand].count++;
    if (a.sentiment === '正面') brand_data[brand].positive++;
    else if (a.sentiment === '中性') brand_data[brand].neutral++;
    else if (a.sentiment === '負面') brand_data[brand].negative++;
  });

  const by_platform = Object.entries(platform_counts).map(([platform, count]) => ({ platform, count }));
  const by_topic = Object.entries(topic_counts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
  const by_sentiment = Object.entries(sentiment_counts).map(([sentiment, count]) => ({ sentiment, count }));
  const by_brand = Object.entries(brand_data)
    .map(([brand, data]) => ({ brand, ...data }))
    .sort((a, b) => b.count - a.count);

  return { total, by_platform, by_topic, by_sentiment, by_brand };
}

/**
 * 儲存報告
 * @param {Object} report 
 */
export function save_report(report) {
  const now = new Date().toISOString();
  
  // 覆寫同一天和同類型的報告
  const existing_index = db.reports.findIndex(r => r.report_date === report.report_date && r.report_type === report.report_type);
  
  if (existing_index >= 0) {
    db.reports[existing_index].content = report.content;
    db.reports[existing_index].created_at = now;
  } else {
    const new_id = db.reports.length > 0 ? Math.max(...db.reports.map(r => r.id)) + 1 : 1;
    db.reports.push({
      id: new_id,
      report_date: report.report_date,
      report_type: report.report_type,
      content: report.content,
      created_at: now
    });
  }
  
  save_db();
}

/**
 * 關閉資料庫連線 (JSON 版本為空實作)
 */
export function close_db() {
  save_db();
}

export default db;
