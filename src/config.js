// ========================================
// 設定檔載入模組
// 從 .env 讀取環境變數，集中管理所有設定
// ========================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

// 載入 .env
dotenv.config({ path: resolve(PROJECT_ROOT, '.env') });

/**
 * 檢查必要環境變數是否已設定
 * @param {string[]} keys - 必要的環境變數名稱
 * @param {string} module_name - 模組名稱（用於錯誤訊息）
 */
function require_env(keys, module_name) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[${module_name}] 缺少必要環境變數: ${missing.join(', ')}\n` +
      `請參考 .env.example 填入 .env 檔案`
    );
  }
}

const config = {
  // 專案路徑
  project_root: PROJECT_ROOT,
  data_dir: resolve(PROJECT_ROOT, 'data'),
  logs_dir: resolve(PROJECT_ROOT, 'logs'),

  // 蒐集器設定
  collector: {
    keywords: ['Canva', 'canva.com', 'Canva AI', 'Canva 設計'],
    timeout_ms: 30000,       // 單次請求逾時 30 秒
    max_retries: 3,          // 最大重試次數
    retry_delay_ms: 2000,    // 重試間隔 2 秒
    max_items_per_source: 50 // 每個來源最多蒐集筆數
  },

  // Gemini API 設定
  gemini: {
    get api_key() {
      require_env(['GEMINI_API_KEY'], 'Gemini');
      return process.env.GEMINI_API_KEY;
    },
    model: 'gemini-2.5-flash',
    max_tokens: 4096
  },

  // LINE Bot 設定
  line: {
    get channel_access_token() {
      require_env(['LINE_CHANNEL_ACCESS_TOKEN'], 'LINE');
      return process.env.LINE_CHANNEL_ACCESS_TOKEN;
    },
    get channel_secret() {
      require_env(['LINE_CHANNEL_SECRET'], 'LINE');
      return process.env.LINE_CHANNEL_SECRET;
    },
    get user_id() {
      require_env(['LINE_USER_ID'], 'LINE');
      return process.env.LINE_USER_ID;
    }
  },

  // Telegram Bot 設定
  telegram: {
    get bot_token() {
      require_env(['TELEGRAM_BOT_TOKEN'], 'Telegram');
      return process.env.TELEGRAM_BOT_TOKEN;
    },
    get chat_id() {
      require_env(['TELEGRAM_CHAT_ID'], 'Telegram');
      return process.env.TELEGRAM_CHAT_ID;
    }
  },

  // Tavily 搜尋 API 設定
  tavily: {
    get api_key() {
      require_env(['TAVILY_API_KEY'], 'Tavily');
      return process.env.TAVILY_API_KEY;
    }
  },

  // 排程設定
  schedule: {
    cron_expression: '0 9 * * *', // 每日 09:00
    timezone: 'Asia/Taipei'
  },

  // 主題分類
  topic_categories: [
    '產品功能',
    '定價與方案',
    '使用者體驗',
    '競品比較',
    '品牌形象',
    'AI 相關',
    '教育與企業',
    '市場動態'
  ],

  // 情緒標籤
  sentiment_labels: ['正面', '中性', '負面']
};

export default config;
