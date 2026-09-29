@echo off
cd /d "%~dp0"
echo ==============================================
echo   Chi Tieu QR - Build + TestFlight
echo ==============================================
echo.
call npm install
if errorlevel 1 goto :error
call npx eas-cli login
if errorlevel 1 goto :error
call npx eas-cli build --platform ios --profile production --auto-submit
if errorlevel 1 goto :error
echo.
echo Da gui build len App Store Connect. Cho Apple xu ly roi mo TestFlight.
pause
exit /b 0
:error
echo.
echo Co loi. Hay chup lai terminal va gui cho ChatGPT.
pause
exit /b 1
