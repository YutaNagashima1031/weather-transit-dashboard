# 首都圏 天気・運行情報

埼玉県川口市・東京都台東区の天気予報、首都圏の運行障害情報、そして自身のゲーミングPCの温度を1画面で確認するダッシュボードです。

公開URL: <https://weather-transit-dashboard.thirteen-devils1031.workers.dev>

## 主な機能

- 2地点の天気予報を、1時間ごと・今日と明日・今日から3日後までのタブで表示
- 天気情報と運行情報を1つの更新操作で再取得
- ライト／ダークモードの切替
- 東京メトロ全線と対象JR路線について、遅延・事故・運転見合わせ・直通運転中止だけを表示
- CPU・GPU温度と、水冷ポンプ回転数（取得可能な場合）を表示するPC温度監視

## ポートフォリオとしての工夫

### 外部データを安全に集約

天気と運行情報の外部APIは、ブラウザから直接呼び出さずCloudflare Workerで取得します。アクセストークンをブラウザやGitHubへ露出させず、画面側には必要な情報だけを返す構成です。

### 「異常だけ見せる」情報設計

運行情報では正常な路線を並べず、利用者に影響がある4種類の障害だけを抽出して表示します。情報量を減らし、朝の移動前に判断しやすい画面を目指しました。

### 常時監視と閲覧時更新を分離

PC側の補助ツールは1分ごとに温度を送信し続け、Webサイトは開かれたときだけ最新値を読み取ります。これにより、サイトを閉じている間も次回閲覧時に直近の温度を確認でき、不要なブラウザ通信を抑えられます。

### コストを抑えた最新値のみの保存

温度は履歴をためず、Cloudflare KVに最新の1件だけを保存します。個人利用では1日1,440回の送信に留まり、無料枠を意識した軽量な構成です。

### セキュリティを分離

PCからの温度送信は専用シークレットで認証します。シークレットを含む `pc-monitor/config.json` は `.gitignore` で除外し、GitHubへ送信しません。共有するのは安全な設定例 `config.example.json` のみです。

## 技術構成

- Frontend: React / TypeScript / Vinext
- Backend: Cloudflare Workers
- Temperature storage: Cloudflare KV
- Weather: Open-Meteo Forecast API
- Transit: 公共交通オープンデータセンター（ODPT）API
- PC sensor: Libre Hardware Monitor + PowerShell uploader

## PC温度監視の設定

詳細は [pc-monitor/README.md](pc-monitor/README.md) を参照してください。Libre Hardware Monitorを起動し、Remote Web Serverを有効化したうえで、送信ツールを設定します。温度が表示されない場合は、Libre Hardware Monitorの起動状態・Remote Web Server・`config.json` の接続先を確認してください。PC側の設定値を含む `config.json` はGitHubに公開しないでください。

## ローカル起動

Windows PowerShellでは、フォルダ名に `&` が含まれるためパスを引用符で囲んでください。

```powershell
node node_modules\vinext\dist\cli.js dev
```
