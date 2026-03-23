@echo off
REM ========================================
REM Canva Brand Sentinel - 主程式與排程執行腳本
REM 自動載入桌面免安裝版 Node.js 環境
REM ========================================

set PATH=C:\Users\user\Desktop\note.js;%PATH%

REM 如果加上 --now 參數則手動執行一次，否則啟動每日排程
node src\index.js %*
