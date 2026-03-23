import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function test_gemini() {
  console.log('🔄 開始測試 Gemini API...');
  
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ 錯誤：環境變數中找不到 GEMINI_API_KEY！');
    process.exit(1);
  }

  console.log(`🔑 取得到金鑰 (開頭為 ${process.env.GEMINI_API_KEY.substring(0, 10)}...)`);

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('🧠 正在發送測試請求：「Hi, can you hear me?」');
    const result = await model.generateContent('Hi, can you hear me? Please reply with a short "Yes, I am working."');
    
    const response = await result.response;
    console.log('\n✅ 測試成功！API 已經可以正常通訊了！');
    console.log('--- 回覆內容 ---');
    console.log(response.text());
    console.log('----------------\n');
  } catch (error) {
    console.error('\n❌ 測試失敗！');
    console.error('錯誤訊息：', error.message);
  }
}

test_gemini();
