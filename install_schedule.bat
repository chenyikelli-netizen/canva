@echo off
chcp 65001 >nul
title Canva Sentinel 排程安裝器

echo =======================================================
echo   Canva Brand Sentinel — 全自動排程安裝器 (Phase 5)
echo =======================================================
echo.
echo 正在幫你把這套系統註冊進 Windows 的「工作排程器」中...
echo 這樣以後你【完全不需要】打開任何程式，它也會在每天早上 10 點自動發貨！
echo.

REM 註冊一個每天早上 10:00 自動執行的排程，執行 run.bat --now
schtasks /create /tn "BrandSentinel_DailyReport" /tr "\"C:\00會用到的\coding project\canva\run_now.bat\"" /sc daily /st 10:00 /f

echo.
echo =======================================================
echo ✅【設定完成】！
echo.
echo 你現在想關機、重新開機、把資料夾關掉都無所謂了。
echo Windows 系統已經記住這個任務，每天早上 10:00 會自動彈出一個黑畫面。
echo 那是系統在自動搜集與分析的過水畫面，大約幾分鐘後報告就會傳進你的手機裡！
echo.
echo 若日後想要取消這個自動推播，可以在 Windows 搜尋「工作排程器」
echo 找到 "BrandSentinel_DailyReport" 把它刪除即可。
echo =======================================================
pause
