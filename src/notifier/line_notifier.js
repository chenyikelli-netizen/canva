// ========================================
// LINE 推送模組
// 透過 LINE Messaging API 發送報告
// ========================================

import { messagingApi } from '@line/bot-sdk';
import config from '../config.js';
import logger from '../utils/logger.js';

const MAX_LINE_MESSAGE_LENGTH = 5000;

/**
 * 發送報告到 LINE
 * @param {string} report - Markdown 格式的報告內容
 * @returns {Promise<boolean>} 是否成功
 */
export async function send_line_message(report) {
  logger.info('開始推送 LINE 訊息...');

  try {
    const client = new messagingApi.MessagingApiClient({
      channelAccessToken: config.line.channel_access_token
    });

    // LINE 訊息長度限制，需要分段發送
    const segments = split_message(report, MAX_LINE_MESSAGE_LENGTH);

    for (let i = 0; i < segments.length; i++) {
      await client.pushMessage({
        to: config.line.user_id,
        messages: [{
          type: 'text',
          text: segments[i]
        }]
      });

      // 多段之間加點間隔
      if (i < segments.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    logger.info(`LINE 推送成功（${segments.length} 段訊息）`);
    return true;
  } catch (error) {
    logger.error(`LINE 推送失敗: ${error.message}`, { stack: error.stack });
    return false;
  }
}

/**
 * 將長訊息分段
 * @param {string} text - 原始文字
 * @param {number} max_length - 每段最大長度
 * @returns {string[]}
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
  const test_message = `🧪 Canva Brand Sentinel — LINE 推送測試

測試時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}

如果你看到這則訊息，代表 LINE 推送功能正常運作。 ✅`;

  send_line_message(test_message)
    .then(success => {
      console.log(success ? '✅ LINE 測試訊息發送成功' : '❌ LINE 測試訊息發送失敗');
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ LINE 測試失敗:', error.message);
      process.exit(1);
    });
}
