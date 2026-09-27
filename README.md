# Zenith — 今夜の空

観測地から見上げた今夜の空と、ISS・天宮・人工衛星の通過予報、流星群の見ごろを表示するウェブアプリです。
GitHub Pages（無料）で公開すると、スマホのホーム画面に追加してアプリのように使えます。

## できること（公開版）

- 現在地ボタンで、いる場所の空を計算
- 人工衛星の軌道データを1日2回、自動で更新（GitHub Actions）。データが1日以上古いときは、スマホからもCelesTrakへ直接取りに行きます（2時間に1回まで）
- ホーム画面に追加、電波のない場所でも最後に開いたデータで表示
- 「かざす」ボタン：スマホを空に向けると、その方向の星座・惑星・人工衛星を表示（iPhoneは最初に「センサーを使ってはじめる」を押して許可）。「カメラ」を押すと実際の景色に星を重ねます

## 公開手順（初回だけ・約10分）

1. GitHub のアカウントを作る（無料）: https://github.com/signup
2. 右上の「+」→「New repository」。名前を `zenith`、**Public** を選んで「Create repository」。
3. 「uploading an existing file」を押し、このフォルダの中身（`index.html` `app.js` `data.js` `sw.js` `manifest.webmanifest` `tle.txt` `README.md` と `icons` フォルダ）をドラッグして「Commit changes」。
4. 自動更新の設定ファイルを作る：「Add file」→「Create new file」。ファイル名の欄に
   `.github/workflows/update-tle.yml` と入力し、フォルダ直下の `update-tle.yml` の中身をコピーして貼り付けて「Commit changes」。
5. 「Settings」→「Actions」→「General」→ 一番下の「Workflow permissions」で **Read and write permissions** を選んで「Save」。
6. 「Settings」→「Pages」→「Branch」を `main` / `/(root)` にして「Save」。
7. 「Actions」タブ →「Update orbital data」→「Run workflow」。1分ほどで `tle.txt` に最新の軌道データが入ります。
8. 1〜2分後、`https://<あなたのユーザー名>.github.io/zenith/` をスマホで開きます。
   - iPhone（Safari）: 共有ボタン →「ホーム画面に追加」
   - Android（Chrome）: メニュー →「ホーム画面に追加」／「アプリをインストール」

## 注意

- 軌道データは CelesTrak（https://celestrak.org）が公開しているものです。更新は1日2回に抑えています（CelesTrak は同じデータの取得を2時間に1回までにするよう求めています）。
- リポジトリに60日間まったく動きがないと、GitHub が定期実行を止めることがあります。その場合は「Actions」タブで再度有効にしてください。
- 衛星の明るさと流星の数は推定値です。時刻は日本時間で表示します。

## データとライブラリ

星: HYG Database v4.1 (CC BY-SA 4.0) / 星座線・星座境界・天の川・メシエ天体: d3-celestial (BSD-3) / 天体暦: Astronomy Engine (MIT) / 衛星軌道計算: satellite.js (MIT, SGP4) / 流星群: IMO 標準値
