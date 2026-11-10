@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  copy ".env.example" ".env" >nul
  if errorlevel 1 exit /b 1
  echo Created .env from .env.example; fill in the required values before running the bridge.
)

call npm ci
exit /b %ERRORLEVEL%
