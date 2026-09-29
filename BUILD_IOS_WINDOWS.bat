@echo off
cd /d "%~dp0"
echo ==============================================
echo   Chi Tieu QR - Build iOS Production
echo ==============================================
echo.
call npm install
if errorlevel 1 goto :error
call npx eas-cli login
if errorlevel 1 goto :error
call npx eas-cli build --platform ios --profile production
if errorlevel 1 goto :error
echo.
echo Build da hoan tat. Mo link EAS hien tren terminal de xem file build.
pause
exit /b 0
:error
echo.
echo Co loi khi build. Hay chup lai terminal va gui cho ChatGPT.
pause
exit /b 1
