$ErrorActionPreference = "Stop"

$launcherPath = Join-Path $PSScriptRoot "start-temperature-uploader.cmd"
if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "The temperature uploader launcher was not found."
}

$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "WeatherTransitTemperatureMonitor.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.Arguments = ""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Weather and transit dashboard temperature uploader"
$shortcut.Save()

Start-Process -FilePath $launcherPath -WindowStyle Hidden
Write-Host "Startup shortcut created and uploader started."
