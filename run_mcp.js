import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 啟動本地安裝的 Apify MCP 伺服器
import('./node_modules/@apify/actors-mcp-server/dist/stdio.js').catch(err => {
    console.error(err);
    process.exit(1);
});
