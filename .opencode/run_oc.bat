@echo off
set "OPENCODE=C:\Users\22786\AppData\Roaming\npm\opencode"
set "DIR=D:\Administrator\Desktop\OpenCode Batch"
set "OUTPUT=D:\Administrator\Desktop\OpenCode Batch\.opencode\oc_result.txt"
if "%1"=="" (
   "%OPENCODE%" run --dir "%DIR%" --format json "test: create test.txt, write hello, then delete" > "%OUTPUT%" 2>&1
) else (
   "%OPENCODE%" run --dir "%DIR%" --format json %* > "%OUTPUT%" 2>&1
)
set E=%ERRORLEVEL%
echo === OC_DONE:%E% ===>> "%OUTPUT%"
