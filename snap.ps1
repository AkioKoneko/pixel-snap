# Pixel-snap launcher (PowerShell). Forwards all args to snap.py.
# Usage:  .\snap.ps1 input.png output.png --trim
param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Args
)
python (Join-Path $PSScriptRoot "snap.py") @Args
