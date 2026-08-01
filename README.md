# 首都圏 天気・運行情報

埼玉県川口市・東京都台東区の天気、首都圏の運行情報、このPCのCPU/GPU温度、必要な分野に絞った主要ニュースをまとめて確認できるダッシュボードです。

公開URL: <https://weather-transit-dashboard.thirteen-devils1031.workers.dev>

## 主な機能

- 2地点の天気予報を「1時間ごと」「今日・明日」「今日〜3日後」で表示
- ライトモード / ダークモード切替
- 東京メトロ全線および対象JR路線の障害情報のみを表示
- CPU/GPU温度をCloudflare KV経由で常時監視
- 日本政治、国内・天気、IT、投資信託・指数のニュースをタブで表示

## PC温度監視と無料枠対策

PC側ではLibre Hardware MonitorのRemote Web Serverから温度を取得し、PowerShell送信ツールがCloudflare Workerへ送信します。`pc-monitor/config.json` にはアクセストークンを保存するため、`.gitignore` によりGitHubへは送信されません。

Cloudflare Workers KVの無料枠を超えないよう、PC側とCloudflare側の両方で書き込みを制御しています。

- PC側: 送信間隔を最短5分に制限
- PC側: 日本時間2:00〜5:59は送信を停止
- Cloudflare側: 5分未満の連続保存を拒否
- Cloudflare側: 日本時間2:00〜5:59は保存を拒否
- 想定KV書き込み: 約244回/日（無料枠の1,000回/日以内）

この二重制御により、古いPC送信ツールが一時的に動いたままでも、Cloudflare KVへの過剰な書き込みを防ぎます。監視表示が更新されない場合は、Libre Hardware Monitorの起動、Remote Web Server、`pc-monitor/config.json`、およびスタートアップ設定を確認してください。

### Libre Hardware Monitorの常駐設定

温度を継続して送信するには、Libre Hardware MonitorをPC上で常駐させる必要があります。`Options` で次を有効にしてください。

- `Run On Windows Startup`
- `Start Minimized`
- `Minimize to Tray`（必要に応じて `Minimize On Close`）
- `Remote Web Server` の `Run`、interface `192.168.11.13`、port `8085`

設定後に `http://localhost:8085/data.json` が表示できれば、センサー情報を送信できる状態です。Webサイトの更新時刻は最短5分ごとで、日本時間2:00〜5:59は意図的に更新を停止します。

詳細なセットアップ手順は [pc-monitor/README.md](pc-monitor/README.md) を参照してください。

## ニュース更新

ニュースは毎日、日本時間の **6:00 / 12:00 / 16:00 / 20:00** にCloudflare Workersのスケジュール実行で更新します。

- 定時更新に失敗して古いキャッシュが残った場合、画面またはニュースAPIへの次回アクセス時に自動で再取得します。
- RSSの見出しを正規化して比較し、配信元が異なっても同じ見出しのニュースは重複表示しません。
- 重複を除外した後も各タブの表示件数を確保できるよう、候補を追加で取得します。

## 技術構成

- Frontend: React / TypeScript / Vinext
- Backend / Hosting: Cloudflare Workers
- Temperature storage: Cloudflare Workers KV
- Weather: Open-Meteo Forecast API
- Transit: 公共交通オープンデータセンター（ODPT）API
- PC sensor: Libre Hardware Monitor + PowerShell
- News: Google News RSS

## ローカル実行

Windows PowerShellでプロジェクト直下から実行します。

```powershell
node .\node_modules\vinext\dist\cli.js dev
```

## 注意事項

- `pc-monitor/config.json`、APIトークン、CloudflareのSecretは公開しません。
- PC温度監視は補助的な監視です。BIOS/UEFIの温度保護・シャットダウン設定も有効にしてください。
