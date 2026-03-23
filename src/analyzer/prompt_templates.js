// ========================================
// LLM Prompt 模板
// 用於主題分類、情緒分析與摘要生成
// ========================================

import config from '../config.js';

/**
 * 生成批次分析的 prompt
 * 將多筆資料一次送入 LLM 做主題分類 + 情緒分析
 * @param {Object[]} items - 待分析的資料陣列
 * @returns {string} 完整 prompt
 */
export function build_analysis_prompt(items) {
  const categories = config.topic_categories.join('、');
  const sentiments = config.sentiment_labels.join('、');

  const data_block = items.map((item, i) => {
    return `[${i + 1}]
平台: ${item.platform}
標題: ${item.title || '(無)'}
內容: ${item.content.substring(0, 500)}`;
  }).join('\n\n');

  return `你是一位專業的品牌輿情分析師，專門分析 Canva 品牌的公開網路討論。

請分析以下 ${items.length} 筆資料，為每一筆做出：
1. **主題分類**：從以下類別中選擇最合適的一個：${categories}
2. **情緒標籤**：從以下標籤中選擇一個：${sentiments}
3. **摘要**：用一句話概括這筆資料的核心觀點（繁體中文，30 字以內）

回傳 JSON 陣列，格式如下：
[
  {
    "index": 1,
    "topic": "主題分類",
    "sentiment": "情緒標籤",
    "summary": "一句話摘要"
  }
]

注意事項：
- 主題分類必須是上述列表中的其中一項，不可自創
- 情緒標籤必須是「正面」「中性」「負面」其中之一
- 如果內容與 Canva 無直接關聯，歸入最接近的類別並標記中性
- 回傳的陣列長度必須等於輸入資料數量 (${items.length})

以下是待分析的資料：

${data_block}`;
}

/**
 * 生成日報洞察的 prompt
 * @param {Object} stats - 統計資料
 * @param {Object[]} top_items - 代表性資料
 * @returns {string}
 */
export function build_insight_prompt(stats, top_items) {
  const items_text = top_items.map((item, i) => {
    return `[${i + 1}] (${item.platform}) [${item.sentiment}] ${item.summary || item.content.substring(0, 200)}`;
  }).join('\n');

  return `你是一位品牌策略分析師，服務對象是 Canva 的股東。

根據今日蒐集的輿情資料統計，請提供：
1. **關鍵洞察**（2-3 點）：與投資效益和品牌發展趨勢相關的觀察
2. **風險警示**（如有）：需要關注的負面趨勢或議題

今日統計：
- 總筆數: ${stats.total}
- 平台分布: ${stats.by_platform.map(p => `${p.platform}: ${p.count}`).join(', ')}
- 情緒分布: ${stats.by_sentiment.map(s => `${s.sentiment}: ${s.count}`).join(', ')}
- 主題分布: ${stats.by_topic.map(t => `${t.topic}: ${t.count}`).join(', ')}

代表性資料：
${items_text}

請以繁體中文回覆，語氣專業但易懂。以 JSON 格式回傳：
{
  "insights": ["洞察1", "洞察2", "洞察3"],
  "risks": ["風險1"] 
}

如果沒有明顯風險，risks 可以為空陣列。`;
}
