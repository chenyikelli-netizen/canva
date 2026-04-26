// ========================================
// LLM Prompt 模板（Phase 2 多品牌 + 競品對比版）
// 用於主題分類、情緒分析、品牌辨識與競品交叉比較
// ========================================

import config from '../config.js';

/**
 * 生成批次分析的 prompt（含品牌辨識）
 * 將多筆資料一次送入 LLM 做主題分類 + 情緒分析 + 品牌歸屬
 * @param {Object[]} items - 待分析的資料陣列
 * @returns {string} 完整 prompt
 */
export function build_analysis_prompt(items) {
  const categories = config.topic_categories.join('、');
  const sentiments = config.sentiment_labels.join('、');
  const all_brands = ['Canva', ...config.collector.competitors.map(c => c.name)];

  const data_block = items.map((item, i) => {
    const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : (item.metadata || {});
    return `[${i + 1}]
平台: ${item.platform}
標題: ${item.title || '(無)'}
內容: ${item.content.substring(0, 500)}
品牌提示: ${meta.brand || '未知'}`;
  }).join('\n\n');

  return `你是一位專業的品牌輿情分析師，負責同時追蹤 ${all_brands.join('、')} 三家設計工具品牌的公開網路討論。

請分析以下 ${items.length} 筆資料，為每一筆做出：
1. **品牌歸屬**：判斷這筆資料主要討論的是哪一個品牌。從以下品牌中選擇：${all_brands.join('、')}。如果同時提及多個品牌（如比較文），選擇被討論最多的那個。
2. **主題分類**：從以下類別中選擇最合適的一個：${categories}
3. **情緒標籤**：從以下標籤中選擇一個：${sentiments}
4. **摘要**：用一句話概括這筆資料的核心觀點（繁體中文，30 字以內）

回傳 JSON 陣列，格式如下：
[
  {
    "index": 1,
    "brand": "品牌名稱",
    "topic": "主題分類",
    "sentiment": "情緒標籤",
    "summary": "一句話摘要"
  }
]

嚴格輸出規範（違反此規範將導致系統崩潰，請務必遵守）：
- 你的回應必須是且僅是一個合法的 JSON 陣列，不得包含任何其他內容
- 禁止在 JSON 前後加上任何文字、解釋、註解、Markdown 標記（如 \`\`\`json）、或空白行
- 禁止在 JSON 內部使用 JavaScript/JSON 註解（// 或 /* */）
- 每個字串值內部的雙引號必須用 \\" 跳脫，換行符必須用 \\n 跳脫
- 所有字串值必須用雙引號包裹，禁止使用單引號
- 品牌歸屬必須是 ${all_brands.join('、')} 其中之一
- 主題分類必須是上述列表中的其中一項，不可自創
- 情緒標籤必須是「正面」「中性」「負面」其中之一
- 如果內容同時比較多個品牌，歸入主要被討論的品牌
- 回傳的陣列長度必須等於輸入資料數量 (${items.length})

以下是待分析的資料：

${data_block}`;
}

/**
 * 生成日報洞察的 prompt（含競品對比矩陣）
 * @param {Object} stats - 統計資料（含品牌分組）
 * @param {Object[]} top_items - 代表性資料
 * @returns {string}
 */
export function build_insight_prompt(stats, top_items) {
  const items_text = top_items.map((item, i) => {
    return `[${i + 1}] (${item.platform}) [${item.brand || 'Canva'}] [${item.sentiment}] ${item.summary || item.content.substring(0, 200)}`;
  }).join('\n');

  // 品牌分組統計
  const brand_stats_text = stats.by_brand
    ? stats.by_brand.map(b => `${b.brand}: ${b.count} 筆 (正面${b.positive || 0}/中性${b.neutral || 0}/負面${b.negative || 0})`).join('\n  ')
    : '(無品牌統計)';

  return `你是一位品牌策略分析師，服務對象是 Canva 的股東。你的任務是從公開輿情資料中提煉出投資決策所需的情報。

今日系統同時追蹤了 Canva、Figma、Adobe Express 三家設計工具品牌。

根據今日蒐集的輿情資料統計，請提供以下六項分析：

1. **關鍵洞察**（2-3 點）：與 Canva 投資效益和品牌發展趨勢相關的觀察
2. **競品對照**（1-2 點）：Canva 與 Figma、Adobe Express 在輿情上的差異解讀，以及這些差異對投資人的意義
3. **風險警示**（如有）：需要關注的負面趨勢或議題
4. **投資人今日持資訊號**：判斷今日資料對「持資判斷」的影響。
   分級標準：
   - 「green」：今日情緒、聲量、主題均在近期趨勢範圍內，無需特別關注
   - 「yellow」：出現一個具體的、尚未確認影響的新信號（例：新議題初現、競品有動作）
   - 「red」：出現一個可能實質影響投資論點的事件（例：情緒急劇惡化、競品顯著突破、系統性負面話題）
   必須引用今日具體數字或事件支撐判斷，禁止空泛表述
5. **今日應更新的認知**：識別一個「股東在讀今日報告之前可能持有的舊認知」，說明今日資料是否讓此認知需要調整。
   - 若今日有顯著新信號 → 說明資料如何「挑戰」或「支持」某個具體的舊認知
   - 若今日無顯著新信號 → 說明「今日資料未改變[XX認知]的有效性」
   禁止對「應更新的認知」給出空洞概括性回答

今日統計：
- 總筆數: ${stats.total}
- 品牌分布:
  ${brand_stats_text}
- 平台分布: ${stats.by_platform.map(p => `${p.platform}: ${p.count}`).join(', ')}
- 情緒分布: ${stats.by_sentiment.map(s => `${s.sentiment}: ${s.count}`).join(', ')}
- 主題分布: ${stats.by_topic.map(t => `${t.topic}: ${t.count}`).join(', ')}

代表性資料：
${items_text}

請以繁體中文回覆，語氣專業但易懂。以 JSON 格式回傳：
{
  "insights": ["洞察1", "洞察2", "洞察3"],
  "competitor_analysis": ["競品觀察1", "競品觀察2"],
  "risks": ["風險1"],
  "investor_signal": {
    "level": "green | yellow | red",
    "reason": "一句話原因，必須引用今日具體數值或事件"
  },
  "cognitive_update": {
    "prior_belief": "股東可能持有的舊認知",
    "impact": "strengthen | challenge | neutral",
    "reason": "一句話說明今日資料如何影響該認知"
  }
}

如果沒有明顯風險，risks 可以為空陣列。
如果競品資料不足，competitor_analysis 可以為空陣列。
不得省略 investor_signal 與 cognitive_update。`;
}
