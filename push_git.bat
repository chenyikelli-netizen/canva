@echo off
git init
git config --local user.name "chenyikelli-netizen"
git config --local user.email "chenyikelli.netizen@github.com"
git add .
git commit -m "feat: setup canva brand sentinel system and integrate apify mcp"
git remote remove origin
git remote add origin https://github.com/chenyikelli-netizen/canva.git
git branch -M main
git push -u origin main
