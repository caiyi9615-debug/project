@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0.env" (
  if not exist "%~dp0.env.example" (
    echo Please extract ALL files from the ZIP before running this file.
    pause
    exit /b 1
  )
  copy /y "%~dp0.env.example" "%~dp0.env" >nul
)
start "" notepad.exe "%~dp0.env"
