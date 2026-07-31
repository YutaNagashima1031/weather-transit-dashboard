param(
  [string]$ConfigPath = "$PSScriptRoot\config.json"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "config.json がありません。config.example.json をコピーして、トークンを設定してください。"
}
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

function Get-AllSensors($node) {
  $result = @()
  if ($null -ne $node.Children) {
    foreach ($child in $node.Children) { $result += Get-AllSensors $child }
  }
  if ($null -ne $node.Text -and $null -ne $node.Value) { $result += $node }
  return $result
}

function Get-Number($value) {
  $match = [regex]::Match([string]$value, '-?\d+(?:\.\d+)?')
  if ($match.Success) { return [double]$match.Value }
  return $null
}

function Find-Temperature($sensors, [string[]]$names) {
  foreach ($name in $names) {
    $sensor = $sensors | Where-Object { $_.Text -like "*$name*" -and $_.Value -match '°C' } | Select-Object -First 1
    if ($sensor) { return Get-Number $sensor.Value }
  }
  return $null
}

while ($true) {
  try {
    $tree = Invoke-RestMethod -Uri $config.sensorUrl -TimeoutSec 10
    $sensors = Get-AllSensors $tree
    $cpu = Find-Temperature $sensors @("CPU Package", "CPU CCD", "CPU Core")
    $gpu = Find-Temperature $sensors @("GPU Core", "GPU Temperature")
    $pumpSensor = $sensors | Where-Object { $_.Text -match 'Pump|ポンプ' -and $_.Value -match 'RPM' } | Select-Object -First 1
    $pump = if ($pumpSensor) { Get-Number $pumpSensor.Value } else { $null }
    if ($null -eq $cpu -or $null -eq $gpu) { throw "CPU または GPU の温度センサーを見つけられません。Libre Hardware Monitor の data.json を確認してください。" }
    $payload = @{ cpuTemperature = $cpu; gpuTemperature = $gpu; capturedAt = (Get-Date).ToUniversalTime().ToString("o") }
    if ($null -ne $pump) { $payload.pumpRpm = $pump }
    Invoke-RestMethod -Method Post -Uri "$($config.workerUrl.TrimEnd('/'))/api/pc-temperature" -Headers @{ Authorization = "Bearer $($config.token)" } -ContentType "application/json" -Body ($payload | ConvertTo-Json -Compress) | Out-Null
    Write-Host "$(Get-Date -Format 'yyyy/MM/dd HH:mm:ss') 温度を送信しました: CPU $cpu ℃ / GPU $gpu ℃"
  } catch {
    Write-Warning $_.Exception.Message
  }
  Start-Sleep -Seconds ([int]$config.intervalSeconds)
}
