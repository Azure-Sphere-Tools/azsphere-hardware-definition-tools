REM This script packs the compiled language server into a tarball under 'packed/language-server.tar.gz'
REM so that it can be easily referenced as a dependency in the visual studio extension

set SCRIPT_DIR=%~dp0
echo %SCRIPT_DIR%

cd %SCRIPT_DIR%\..
call npm run build
cd %SCRIPT_DIR%
call npm pack
echo "Deleting old packed server"
DEL /Y /S %SCRIPT_DIR%\packed

if not exist packed MKDIR -p packed
MOVE /Y %SCRIPT_DIR%\*.tgz packed\language-server.tar.gz