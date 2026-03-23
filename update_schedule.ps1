$tasks = @("BrandSentinel_DailyReport", "BrandSentinel_AutoBackup")
foreach ($name in $tasks) {
    try {
        $task = Get-ScheduledTask -TaskName $name
        if ($task) {
            $settings = $task.Settings
            $settings.StartWhenAvailable = $true
            Set-ScheduledTask -TaskName $name -Settings $settings | Out-Null
            Write-Host "✅ 成功更新排程: $name (已開啟「錯過時補救執行」功能)" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ 找不到排程: $name" -ForegroundColor Red
    }
}
