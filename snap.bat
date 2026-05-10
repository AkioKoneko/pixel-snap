@echo off
rem Pixel-snap launcher. Forwards all args to snap.py.
rem Usage:  snap.bat input.png output.png [--trim] [--k 16] [...]
python "%~dp0snap.py" %*
