# 火廻り 配布手順

## ローカルで起動する

`ゲームを起動.cmd`をダブルクリックすると、ローカルサーバーを必要に応じて起動し、ゲームをブラウザで開きます。PCを再起動した後や、`ERR_CONNECTION_REFUSED`が表示された場合も同じ操作で復旧できます。

## アップロードするファイル

1. プロジェクトフォルダで `npm.cmd run build` を実行します。
2. 生成された `dist` フォルダの中身を、Webサーバー上のゲーム用フォルダへそのままアップロードします。
3. `index.html`、`styles.css`、`game.js`と、`assets`フォルダ一式を同じ構成で置いてください。

アップロード前に`npm.cmd run preview`を実行し、`http://127.0.0.1:4173/`で配布物を確認できます。

アップロード対象は次のファイルとフォルダです。

```text
index.html
styles.css
game.js
assets/
```

開発用の `src`、`tests`、`tools`、`package.json`はアップロード不要です。

プロジェクト直下の`index.html`をダブルクリックした場合も起動できます。この場合も`index.html`、`styles.css`、`game.js`、`assets/`を同じ構成で置いてください。ソースを変更した後は、先に`npm.cmd run build`を実行して`game.js`を更新します。

## GitHub Pagesで公開する

GitHubリポジトリを作成し、プロジェクト直下の配布ファイルを`main`ブランチへpushします。`dist`を別途選ぶ必要はありません。ルートにある`index.html`と`assets/`をそのまま公開します。

```powershell
npm.cmd run build
git add .
git commit -m "Prepare GitHub Pages build"
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

GitHubリポジトリの **Settings → Pages → Build and deployment** で、Sourceを **Deploy from a branch**、Branchを **main**、Folderを **/(root)** にしてSaveします。デプロイ完了後のURLは次の形式です。

```text
https://<ユーザー名>.github.io/<リポジトリ名>/
```

更新時は`npm.cmd run build`、`git add .`、`git commit`、`git push`の順に実行します。GitHub Pagesでは`assets/`も毎回公開対象に含めてください。

## Webサイトからのリンク

例えば `https://example.co.jp/games/hinomawari/` にアップロードした場合、会社サイトには次のような通常のリンクを追加します。

```html
<a href="/games/hinomawari/">火廻りをプレイ</a>
```

別タブで開く場合は次の形式です。

```html
<a href="/games/hinomawari/" target="_blank" rel="noopener">火廻りをプレイ</a>
```

## サーバー要件

- 静的ファイルをHTTPSで配信できること
- `.html`を`text/html`、`.css`を`text/css`、`.js`を`text/javascript`または`application/javascript`で配信すること
- URL末尾がゲーム用フォルダの場合に、その中の`index.html`を返すこと

サーバー側プログラム、データベース、外部APIは不要です。ゲーム中の通信もありません。進行状況、ハイスコア、音量、速度固定設定は、プレイしたブラウザの`localStorage`へ保存されます。別の端末やブラウザには共有されません。

## 更新時の注意

更新時は`dist`の一部だけでなく、中身を一式アップロードしてください。サーバーやCDNが長期間キャッシュする場合は、ゲーム用フォルダをバージョン別にする方法が確実です。

```text
/games/hinomawari/v1/
/games/hinomawari/v2/
```
