import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    console.log("支援的模型列表：");
    if (data.models) {
        data.models.forEach(m => console.log(m.name));
    } else {
        console.log(data);
    }
  } catch (err) {
    console.error(err);
  }
}
listModels();
