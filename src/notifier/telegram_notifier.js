// ========================================
// Telegram 推送模組
// 透過 Telegram Bot API 發送報告
// ========================================

import TelegramBot from 'node-telegram-bot-api';
import config from '../config.js';
import logger from '../utils/logger.js';

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

/**
 * 發送報告到 Telegram
 * @param {string} report - Markdown 格式的報告內容
 * @returns {Promise<boolean>} 是否成功
 */
export async function send_telegram_message(report) {
  logger.info('開始推送 Telegram 訊息...');

  try {
    // 使用 polling: false 因為我們只需要發送，不需要監聽
    const bot = new TelegramBot(config.telegram.bot_token, { polling: false });
    const chat_id = config.telegram.chat_id;

    // Telegram 也有訊息長度限制
    const segments = split_message(report, MAX_TELEGRAM_MESSAGE_LENGTH);

    for (let i = 0; i < segments.length; i++) {
      await bot.sendMessage(chat_id, segments[i], {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

      if (i < segments.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    logger.info(`Telegram 推送成功（${segments.length} 段訊息）`);
    return true;
  } catch (error) {
    // Markdown 解析失敗時，嘗試以純文字重新發送
    if (error.message?.includes('parse')) {
      logger.warn('Telegram Markdown 解析失敗，嘗試純文字模式');
      try {
        const bot = new TelegramBot(config.telegram.bot_token, { polling: false });
        await bot.sendMessage(config.telegram.chat_id, report);
        logger.info('Telegram 純文字推送成功');
        return true;
      } catch (fallback_error) {
        logger.error(`Telegram 純文字推送也失敗: ${fallback_error.message}`);
      }
    }

    logger.error(`Telegram 推送失敗: ${error.message}`, { stack: error.stack });
    return false;
  }
}

/**
 * 將長訊息分段
 */
function split_message(text, max_length) {
  if (text.length <= max_length) return [text];

  const segments = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > max_length && current.length > 0) {
      segments.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

// 支援獨立測試模式
if (process.argv.includes('--test')) {
  const test_message = `🧪 Canva Brand Sentinel — Telegram 推送測試

測試時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}

如果你看到這則訊息，代表 Telegram 推送功能正常運作。 ✅`;

  send_telegram_message(test_message)
    .then(success => {
      console.log(success ? '✅ Telegram 測試訊息發送成功' : '❌ Telegram 測試訊息發送失敗');
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Telegram 測試失敗:', error.message);
      process.exit(1);
    });
}
