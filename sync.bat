@echo off
setlocal
cd /d "%~dp0"

REM Update the local checkout to the latest GitHub version.
REM Untracked/ignored files (.env, tools/piper, voices) are never touched:
REM git only rewrites tracked files, and a hard reset would still keep ignored paths.

git fetch origin
if errorlevel 1 exit /b 1

set BRANCH=feat/discord-bridge
for /f %%i in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%i

REM Local edits to tracked files would block a fast-forward; park them in a stash
REM (restorable with: git stash pop) so the sync can't destroy anything.
git diff --quiet
if errorlevel 1 (
  echo Local edits detected - stashing them so nothing is lost...
  git stash push -m "sync.bat auto-stash %DATE% %TIME%"
  if errorlevel 1 exit /b 1
)

git merge --ff-only "origin/%BRANCH%"
if errorlevel 1 (
  echo Fast-forward failed - remote history changed or local commits conflict.
  echo Your stashed edits, commits, .env and other ignored files are all still there.
  exit /b 1
)

REM Refresh dependencies to match any package.json/package-lock changes.
call npm ci
exit /b %ERRORLEVEL%
