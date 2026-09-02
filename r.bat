@echo off
cls
if not exist ".env" (
    node setup.js
)
start "" "%SystemRoot%\System32\conhost.exe" "%SystemRoot%\System32\cmd.exe" /c "node src/index.js"
