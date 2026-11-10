@echo off
setlocal
cd /d "%~dp0"
node src\index.js
exit /b %ERRORLEVEL%
