$ErrorActionPreference = "Stop"

$uploaderPath = Join-Path $PSScriptRoot "pc-temperature-uploader.ps1"
if (-not (Test-Path -LiteralPath $uploaderPath)) {
  throw "The temperature uploader script was not found."
}

$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "WeatherTransitTemperatureMonitor.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$uploaderPath`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Weather and transit dashboard temperature uploader"
$shortcut.Save()

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", $uploaderPath -WindowStyle Hidden
Write-Host "Startup shortcut created and uploader started."
