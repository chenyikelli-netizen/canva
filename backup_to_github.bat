
@echo off
cd /d "%~dp0"
git add data/brand_sentinel.json
git add install_backup_task.js
git add backup_to_github.bat
git add .gitignore
git commit -m "chore(backup): daily database to github"
git push origin main
