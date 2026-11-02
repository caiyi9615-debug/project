@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 20 LTS or newer: https://nodejs.org/
  pause
  exit /b 1
)
if not exist ".env" copy /y ".env.example" ".env" >nul
set "OPEN_BROWSER=1"
node server.js
if errorlevel 1 pause
