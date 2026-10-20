@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 윈도우: 더블클릭하면 창 없이 서버를 켜고 브라우저를 엽니다. 이미 켜져 있으면 브라우저만 엽니다.
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',3600); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  start "" http://127.0.0.1:3600/
  exit /b
)
where pythonw >nul 2>&1
if %errorlevel%==0 (
  start "" pythonw server.py
) else (
  start "로또 확률 연구소" python server.py
)
