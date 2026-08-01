param(
  [string]$ConfigPath = "$PSScriptRoot\config.json"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "config.json is missing. Copy config.example.json to config.json first."
}
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$intervalSeconds = [Math]::Max(300, [int]$config.intervalSeconds)

function Get-AllSensors($node) {
  $result = @()
  if ($null -ne $node.Children) {
    foreach ($child in $node.Children) { $result += Get-AllSensors $child }
  }
  if ($null -ne $node.Text -and $null -ne $node.Value) { $result += $node }
  return $result
}

function Get-AllNodes($node) {
  $result = @($node)
  if ($null -ne $node.Children) {
    foreach ($child in $node.Children) { $result += Get-AllNodes $child }
  }
  return $result
}

function Get-Number($value) {
  $match = [regex]::Match([string]$value, '-?\d+(?:\.\d+)?')
  if ($match.Success) { return [double]$match.Value }
  return $null
}

function Find-Temperature($sensors, [string[]]$names) {
  foreach ($name in $names) {
    $sensor = $sensors | Where-Object { $_.Text -like "*$name*" -and $_.Value -match 'C' } | Select-Object -First 1
    if ($sensor) { return Get-Number $sensor.Value }
  }
  return $null
}

function Find-HardwareName($nodes, [string[]]$patterns) {
  foreach ($pattern in $patterns) {
    $node = $nodes | Where-Object { $_.Text -match $pattern } | Select-Object -First 1
    if ($node) { return [string]$node.Text }
  }
  return $null
}

while ($true) {
  $now = Get-Date
  if ($now.Hour -ge 2 -and $now.Hour -lt 6) {
    $resumeAt = $now.Date.AddHours(6)
    $pauseSeconds = [Math]::Max(60, [int]($resumeAt - $now).TotalSeconds)
    Write-Host "$(Get-Date -Format 'yyyy/MM/dd HH:mm:ss') Paused until 06:00"
    Start-Sleep -Seconds $pauseSeconds
    continue
  }
  try {
    $tree = Invoke-RestMethod -Uri $config.sensorUrl -TimeoutSec 10
    $sensors = Get-AllSensors $tree
    $nodes = Get-AllNodes $tree
    $cpuNames = @("CPU Package", "Core (Tctl/Tdie)", "CCDs Max (Tdie)", "CPU CCD", "CPU Core")
    $gpuNames = @("GPU Core", "GPU Temperature")
    $cpuHardwarePatterns = @("AMD Ryzen", "Intel.*Core")
    $gpuHardwarePatterns = @("NVIDIA GeForce", "NVIDIA RTX", "AMD Radeon", "Intel Arc")
    $cpu = Find-Temperature -sensors $sensors -names $cpuNames
    $gpu = Find-Temperature -sensors $sensors -names $gpuNames
    $cpuName = Find-HardwareName -nodes $nodes -patterns $cpuHardwarePatterns
    $gpuName = Find-HardwareName -nodes $nodes -patterns $gpuHardwarePatterns
    $pumpSensor = $sensors | Where-Object { $_.Text -match 'Pump' -and $_.Value -match 'RPM' } | Select-Object -First 1
    $pump = if ($pumpSensor) { Get-Number $pumpSensor.Value } else { $null }
    if ($null -eq $cpu -or $null -eq $gpu) { throw "CPU or GPU temperature sensor was not found." }
    $payload = @{ cpuTemperature = $cpu; gpuTemperature = $gpu; capturedAt = (Get-Date).ToUniversalTime().ToString("o") }
    if ($null -ne $cpuName) { $payload.cpuName = $cpuName }
    if ($null -ne $gpuName) { $payload.gpuName = $gpuName }
    if ($null -ne $pump) { $payload.pumpRpm = $pump }
    $response = Invoke-RestMethod -Method Post -Uri "$($config.workerUrl.TrimEnd('/'))/api/pc-temperature" -Headers @{ Authorization = "Bearer $($config.token)" } -ContentType "application/json" -Body ($payload | ConvertTo-Json -Compress)
    if ($response.status -eq "saved") {
      Write-Host "$(Get-Date -Format 'yyyy/MM/dd HH:mm:ss') Uploaded: CPU $cpu C / GPU $gpu C"
    } else {
      Write-Host "$(Get-Date -Format 'yyyy/MM/dd HH:mm:ss') Skipped: $($response.reason)"
    }
  } catch {
    Write-Warning $_.Exception.Message
  }
  Start-Sleep -Seconds $intervalSeconds
}
