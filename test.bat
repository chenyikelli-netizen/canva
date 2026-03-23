@echo off
REM ========================================
REM Canva Brand Sentinel - 測試腳本
REM 自動載入桌面免安裝版 Node.js 環境
REM ========================================

set PATH=C:\Users\user\Desktop\note.js;%PATH%

echo 1. 測試資料蒐集器 (輸入 1)
echo 2. 測試 LLM 分析 (輸入 2)
echo 3. 測試報告生成 (輸入 3)
echo 4. 測試 LINE/Telegram 推送 (輸入 4)
echo 5. 測試 Tavily 搜尋 (輸入 5)
set /p choice="請選擇測試項目: "

if "%choice%"=="1" node src\collectors\test_collectors.js
if "%choice%"=="2" node src\analyzer\analyzer.js --test
if "%choice%"=="3" node src\reporter\daily_report.js --test
if "%choice%"=="4" node src\notifier\line_notifier.js --test && node src\notifier\telegram_notifier.js --test
if "%choice%"=="5" node src\collectors\test_collectors.js --tavily

pause
