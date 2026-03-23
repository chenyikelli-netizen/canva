@echo off
REM ========================================
REM Apify MCP Server 啟動批次檔
REM ========================================

REM 載入專案的免安裝 Node.js
set PATH=C:\Users\user\Desktop\note.js;%PATH%

REM 啟動 MCP 伺服器
node c:\00會用到的\coding project\canva\node_modules\@apify\actors-mcp-server\dist\stdio.js
