@echo off
cd /d %~dp0
if not exist node_modules (
  echo Dang cai dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
echo Khoi dong Chi Tieu QR...
call npx expo start
pause
