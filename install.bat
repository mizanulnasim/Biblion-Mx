@echo off
rem Biblion Management: install, check and (optionally) preview.
rem   install.bat             build, hygiene check and tests
rem   install.bat --preview   the same, then start the app on this computer
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is needed. Get it from https://nodejs.org and run this again.
  exit /b 1
)
node tools\install.mjs %*
