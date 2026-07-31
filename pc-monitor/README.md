# PC温度監視（常時監視方式）

この補助ツールは、PCのCPU/GPU温度を1分ごとにCloudflare Workerへ送信します。Webサイトを閉じている間も送信を続け、サイトを開いたときは保存済みの最新値を表示します。

## 初回設定

1. Libre Hardware Monitorを起動し、`Options` → `Remote Web Server` を有効にします。URLは初期値の `http://localhost:8085/data.json` を使用します。外部公開は不要です。
2. `config.example.json` をコピーし、同じフォルダに `config.json` という名前で保存します。
3. `config.json` の `token` に、Cloudflare Workerのシークレット `PC_MONITOR_TOKEN` と同じ値を入力します。
4. PowerShellで `pc-temperature-uploader.ps1` を実行します。終了は `Ctrl + C` です。

`config.json` はトークンを含むためGitHubへ登録しません。

## 表示されない場合の確認

- Libre Hardware Monitorが起動しているか確認します。
- `Options` → `Remote Web Server` の `Run` が有効であることを確認します。
- ブラウザで `config.json` の `sensorUrl` を開き、JSON形式のセンサー情報が表示されることを確認します。
- `config.json` の `workerUrl`、`token`、`sensorUrl` が正しいか確認します。
- CPU/GPU名はLibre Hardware Monitorが認識した製品名を送信します。送信ツールの更新後は、Windows再起動または送信ツールの再起動で反映されます。

## Windows起動時に自動で監視する

1. Libre Hardware Monitorの `Options` → `Run On Windows Startup` を有効にします。
2. このフォルダで `register-startup-task.ps1` を一度実行します。以後、Windowsへのログイン時に温度送信ツールがバックグラウンドで起動します。

停止する場合は、PowerShellで次を実行します。

```powershell
Remove-Item -LiteralPath ([Environment]::GetFolderPath("Startup") + "\\WeatherTransitTemperatureMonitor.lnk")
```
