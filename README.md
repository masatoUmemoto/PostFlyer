# PostFlyers

PostFlyers は、AWS Amplify (AppSync + Cognito Identity Pool + DynamoDB) を基盤にした匿名位置共有アプリです。React 19 + Vite 7 製の PWA から簡単にセッションを開始し、GPS ポイントをクラウドへ送信し、参加者同士の移動を MapLibre 上で可視化できます。

## 特長
- React 19 / Vite 7 / TypeScript で実装されたモダン PWA。`vite-plugin-pwa` によりインストール対応と service worker を備えています。
- `useTrackRecorder` フックが Geolocation を監視し、速度に応じて送信間隔を 15 秒 (高速移動) / 60 秒 (低速時) に切り替えつつ、バッファリングしたポイントを AppSync へ一括送信します。
- `useLiveTracks` フックが最新 15 分のポイントをポーリング (デフォルト 15 秒間隔) し、他参加者の移動をセッション別に集計します。
- MapLibre + CARTO ベースマップで自身/他者/履歴を同時表示し、ポップアップでニックネームとタイムスタンプを確認できます。
- Cognito Identity Pool によるゲスト IAM 認証を利用し、AppSync GraphQL API と DynamoDB へ安全に保存します。履歴パネルでは日付範囲から最大 5,000 件を取得し、ニックネーム別投稿数を集計表示します。

## 構成概要
### フロントエンド (`frontend/`)
- `src/App.tsx`: UI フロー・権限チェック・インストールバナー・履歴取得など画面全体のオーケストレーション。
- `src/hooks/useTrackRecorder.ts`: 位置情報のバッファリングと送信、速度推定、未送信ポイントの再送制御を担当。
- `src/hooks/useLiveTracks.ts`: AppSync から最新ポイントをポーリングしてセッション単位にグループ化。
- `src/hooks/usePwaInstallPrompt.ts`: PWA インストールプロンプトと display-mode 監視をラップ。
- `src/components/MapView.tsx`: MapLibre の初期化、GeoJSON ソース更新、履歴ポップアップの制御。
- `src/services/appsyncService.ts`: Amplify GraphQL クライアントのラッパー。セッション開始/終了、ポイント一覧取得、バッチ送信 (`TrackPointBatchError` による部分失敗ハンドリング) を提供します。
- `src/amplify/`: Amplify が生成した GraphQL ドキュメント・型定義 (`client.ts`, `graphql.ts`, `types.ts`)。

### バックエンド (`amplify/`)
- `amplify/backend/api/postflyers/schema.graphql`: `Session` と `TrackPoint` モデルを公開ゲスト (`identityPool`) で利用可能に定義。`trackId + ts + pointId` の複合キーで時系列ポイントを保存します。
- `schema.graphql`: デプロイ済み API の SDL をチェックインしたもの。
- `amplify/team-provider-info.json`: `dev` 環境 (AppId: `d2dpxdlim8zvwd`, Region: `ap-northeast-1`) のメタ情報。
- `amplify/backend/*/build`: Amplify CLI が生成した CloudFormation テンプレートとリゾルバー。

## セットアップ
### 1. バックエンド (Amplify)
1. Amplify CLI をインストール:
   ```bash
   npm install -g @aws-amplify/cli
   ```
2. 既存 `dev` 環境を取得 (対象 AWS アカウントへのアクセスが必要):
   ```bash
   amplify pull --appId d2dpxdlim8zvwd --envName dev
   ```
   新規構築する場合は `amplify init` 後に `amplify push` を実行します。スキーマ変更時も同様に `amplify push` で反映します。
3. `src/` に生成された `aws-exports` / `amplifyconfiguration` がフロントエンドと整合しているか確認し、必要に応じて `frontend/src/` にコピーします (`amplify pull --frontend javascript` で同期可能)。

### 2. フロントエンド (PWA)
1. 依存パッケージをインストール:
   ```bash
   cd frontend
   npm install
   ```
2. Cognito Identity Pool / AppSync エンドポイントは `frontend/src/aws-exports.ts` で管理しています。環境ごとに切り替える場合は同ファイルを更新するか、Amplify 生成ファイルを差し替えてください。環境変数 (`VITE_*`) は現状利用していません。
3. 開発サーバーを起動:
   ```bash
   npm run dev
   ```
4. 本番ビルド:
   ```bash
   npm run build
   ```
   (ビルド結果は `frontend/dist/` に出力されます。)

## 使い方概要
1. 初回アクセス時に位置情報権限を許可してください。許可されない場合はオーバーレイで案内が表示されます。
2. ニックネーム (任意) を入力してセッションを開始すると、位置取得が自動で開始されます。高速移動時は 15 秒間隔、低速時は 60 秒間隔でバッファをフラッシュします。
3. 送信に失敗しても成功したポイントは再送しません。ネットワーク復旧後、保留ポイントのみ再送されます。
4. 他参加者のポイントは 15 秒毎に最新 15 分分が取得され、地図上で折れ線＋最新点として表示されます。
5. 履歴パネルで日付範囲を指定し、任意のニックネームでフィルタすると過去の投稿を可視化できます (最大 5,000 件)。
6. インストールバナーから PWA をホーム画面に追加すると、オフラインでも起動しやすくなります。

## テスト・ビルド
- `npm run lint`
- `npm run build`
- Amplify リソースの更新時は `amplify push` を使用してください。

## 既知の注意点
- マップのベーススタイルは CARTO Positron を利用しています。外部スタイル URL が許可されていない環境では地図が表示されません。
- 長時間の位置取得ではブラウザ・端末のバックグラウンド制限により測位間隔が延びる場合があります。

