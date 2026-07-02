@echo off
chcp 65001 >nul
echo 開始更新並上傳至遠端...

git add .
set /p commitMsg="請輸入更新說明 (直接按 Enter 將使用預設訊息): "

if "%commitMsg%"=="" (
    git commit -m "Auto-update: add sorting and click-based view counting"
) else (
    git commit -m "%commitMsg%"
)

git push

echo.
echo 更新完成！
pause
