
@echo off
cd /d "%~dp0"
git add data/brand_sentinel.json
git add reports/
git add install_backup_task.js
git add backup_to_github.bat
git add .gitignore
git commit -m "chore(backup): daily markdown report and DB to github"
git push origin main
