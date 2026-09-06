@echo off
if "%~1"=="" (
  echo Drag one or more image files onto this window to upscale them 2x.
  pause
  exit /b 1
)

if not "%UPSCALE_RELAUNCHED%"=="1" (
  set "UPSCALE_RELAUNCHED=1"
  start "Upscale Images" cmd /k call "%~f0" %*
  exit /b
)

setlocal enabledelayedexpansion
set SCRIPT=%~dp0upscale_image.py
set SCALE=2

REM Prefer the CUDA-enabled torch bundled with ComfyUI when this machine has
REM it (much faster); otherwise fall back to whatever "python" is on PATH -
REM this is what makes the same tools/ folder work on a different computer.
set "COMFY_PYTHON=D:\StabilityMatrix\Packages\ComfyUI\venv\Scripts\python.exe"
if exist "%COMFY_PYTHON%" (
  set "PYTHON=%COMFY_PYTHON%"
) else (
  set "PYTHON=python"
)
echo Using Python: %PYTHON%

for %%F in (%*) do (
  echo.
  echo === %%~nxF ===
  "%PYTHON%" "%SCRIPT%" "%%~F" --scale %SCALE%
)

echo.
echo Done. Output files are named "<original>_upscaled.png" next to the originals.
