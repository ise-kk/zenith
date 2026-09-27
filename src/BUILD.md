# ソースからの組み立て

公開用の `app.js` は `src/` の3ファイルを1つにまとめたものです。

```
npm i astronomy-engine@2.1.19 satellite.js@5.0.0 esbuild
npx esbuild src/app.js --bundle --minify --format=iife --target=es2019 --outfile=app.js
```

`data.js`（星・星座・天の川・メシエ天体のデータ）は HYG v4.1 と d3-celestial 0.7.35 から作成しています。
公開用の `index.html` は `src/index.html` の前後に `<head>` を足したものです。
