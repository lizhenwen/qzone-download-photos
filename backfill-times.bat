@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo 未找到 Node.js，请先安装后再运行。
  pause
  exit /b 1
)

if not exist "node_modules\exiftool-vendored" (
  echo 未找到依赖，请先在本目录执行 npm install
  pause
  exit /b 1
)

node "%~dp0backfill-times.js" %*
echo.
pause
