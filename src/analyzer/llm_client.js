// ========================================
// Gemini API 封裝模組
// 提供結構化 JSON 輸出的 LLM 呼叫介面
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

      try {
        let clean_text = response_text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
        // 修復 LLM 可能漏掉的陣列間逗號（例如 } { 變成 }, {）
        clean_text = clean_text.replace(/\}\s*\{/g, '},{');
        return JSON.parse(clean_text);
      } catch (parse_error) {
        // 退回正則貪婪表達式提取最外層括號
        let json_match = response_text.match(/\[[\s\S]*\]/);
        if(!json_match) json_match = response_text.match(/\{[\s\S]*\}/);
        
        if (json_match) {
          try {
            return JSON.parse(json_match[0]);
          } catch(e) {
            throw new Error(`嘗試提取外層 JSON 仍解析失敗: ${e.message}`);
          }
        }
        throw new Error(`無法解析 Gemini 回應為 JSON: ${response_text.substring(0, 200)}`);
      }
    } catch (error) {
      logger.warn(`Gemini API 呼叫失敗 (第 ${attempt}/${max_retries} 次): ${error.message}`);

      if (attempt === max_retries) {
        throw error;
      }

      // 指數退避
      const delay = 2000 * Math.pow(2, attempt - 1);
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
