@echo off
REM ============================================================
REM Inicia o Lumi e mantém rodando pra sempre. Se o node.js
REM travar ou fechar por qualquer motivo, esse loop reinicia
REM ele sozinho automaticamente, sem precisar de PM2 nem de
REM nenhuma ferramenta extra.
REM ============================================================

cd /d "%~dp0"

:loop
echo.
echo ===================================================
echo Iniciando o Lumi... (%date% %time%)
echo ===================================================
node index.js

echo.
echo O bot parou. Reiniciando em 5 segundos...
timeout /t 5 /nobreak
goto loop
