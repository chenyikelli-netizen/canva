// ========================================
// Gemini API 封裝模組
// 提供結構化 JSON 輸出的 LLM 呼叫介面
// v2: 強化 JSON 清洗 + 尊重 API retryDelay
// ========================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import logger from '../utils/logger.js';

let genai_instance = null;
let model_instance = null;

/**
 * 取得或初始化 Gemini 模型實例（延遲初始化）
 */
function get_model() {
  if (!model_instance) {
    genai_instance = new GoogleGenerativeAI(config.gemini.api_key);
    model_instance = genai_instance.getGenerativeModel({
      model: config.gemini.model
    });
  }
  return model_instance;
}

/**
 * 從 429 錯誤訊息中提取建議的重試延遲秒數
 * @param {string} error_message - 錯誤訊息
 * @returns {number|null} 延遲秒數（毫秒），或 null 若無法提取
 */
function extract_retry_delay(error_message) {
  // 匹配格式: "Please retry in 36.382765892s"
  const match = error_message.match(/retry in (\d+\.?\d*)s/i);
  if (match) {
    const seconds = parseFloat(match[1]);
    // 加 2 秒緩衝，確保確實過了冷卻期
    return Math.ceil((seconds + 2) * 1000);
  }
  return null;
}

/**
 * 將 LLM 回傳的文字清洗為可解析的 JSON
 * 處理常見的 LLM 輸出瑕疵：多餘文字、缺少逗號、尾部逗號等
 * @param {string} raw_text - 原始 LLM 回應文字
 * @returns {Object} 解析後的 JSON 物件
 */
function parse_llm_json(raw_text) {
  // 第一輪：移除 markdown 程式碼區塊標記
  let text = raw_text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();

  // 第二輪：嘗試直接解析（最理想情況）
  try {
    return JSON.parse(text);
  } catch {
    // 繼續清洗
  }

  // 第三輪：修復常見 JSON 瑕疵
  text = text
    .replace(/}\s*{/g, '},{')       // 修復物件間缺少逗號（} { → },{）
    .replace(/,\s*]/g, ']')          // 修復陣列尾部多餘逗號
    .replace(/,\s*}/g, '}')          // 修復物件尾部多餘逗號
    .replace(/\n/g, ' ')             // 移除換行符
    .replace(/[\x00-\x1F\x7F]/g, ' '); // 移除控制字元

  try {
    return JSON.parse(text);
  } catch {
    // 繼續下一個策略
  }

  // 第四輪：提取第一個完整的 JSON 陣列 [...]
  const array_match = text.match(/\[[\s\S]*?\](?=\s*$|\s*[^,\]\}])/);
  if (array_match) {
    try {
      let extracted = array_match[0]
        .replace(/}\s*{/g, '},{')
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}');
      return JSON.parse(extracted);
    } catch {
      // 繼續下一個策略
    }
  }

  // 第五輪：提取最外層的 [...] 或 {...}（貪婪匹配）
  let json_match = text.match(/\[[\s\S]*\]/);
  if (!json_match) json_match = text.match(/\{[\s\S]*\}/);

  if (json_match) {
    try {
      let extracted = json_match[0]
        .replace(/}\s*{/g, '},{')
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}');
      return JSON.parse(extracted);
    } catch (e) {
      throw new Error(`嘗試提取外層 JSON 仍解析失敗: ${e.message}`);
    }
  }

  throw new Error(`無法解析 Gemini 回應為 JSON: ${text.substring(0, 200)}`);
}

/**
 * 呼叫 Gemini API 並取得結構化 JSON 回應
 * @param {string} prompt - 完整 prompt
 * @param {number} max_retries - 最大重試次數
 * @returns {Promise<Object>} 解析後的 JSON 物件
 */
export async function call_gemini_json(prompt, max_retries = 3) {
  const model = get_model();

  for (let attempt = 1; attempt <= max_retries; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: config.gemini.max_tokens,
          responseMimeType: 'application/json'
        }
      });

      const response_text = result.response.text();
      return parse_llm_json(response_text);

    } catch (error) {
      logger.warn(`Gemini API 呼叫失敗 (第 ${attempt}/${max_retries} 次): ${error.message}`);

      if (attempt === max_retries) {
        throw error;
      }

      // 計算重試延遲：優先使用 API 回傳的建議延遲，否則使用指數退避
      let delay;
      const api_delay = extract_retry_delay(error.message);

      if (api_delay && error.message.includes('429')) {
        delay = api_delay;
        logger.info(`尊重 API 建議延遲: ${Math.round(delay / 1000)}s 後重試`);
      } else {
        // 指數退避: 2s → 4s → 8s → 16s...
        delay = 2000 * Math.pow(2, attempt - 1);
      }

      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * 呼叫 Gemini API 取得純文字回應
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function call_gemini_text(prompt) {
  const model = get_model();

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: config.gemini.max_tokens
    }
  });

  return result.response.text();
}
