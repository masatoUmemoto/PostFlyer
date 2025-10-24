# PostFlyers

PostFlyers は、AWS Amplify（AppSync + DynamoDB）を基盤にした匿名位置情報セッション共有アプリです。React/Vite 製の PWA から簡単にセッションを開始し、GPS ポイントをクラウドへ送信、参加者全員の動きを MapLibre 上で追跡できます。

## 特長
- React 19 と Vite 7、`vite-plugin-pwa` を組み合わせたインストール対応のモダン PWA。
- `useTrackRecorder` が位置情報をバッファリングし、移動時は 15 秒、待機中は 60 秒間隔で AppSync に一括送信。
- MapLibre と Carto ベースマップを使い、自分と他参加者、履歴の重ね合わせを同時に表示。
- Cognito Identity Pool のゲスト認証を利用し、AppSync GraphQL API と DynamoDB に安全に保存。
- 履歴パネルでは日付範囲内の最大 5,000 件を再生し、ニックネーム別の投稿数を集計。

## アーキテクチャ概要

### フロントエンド
- `frontend/src/App.tsx` が UI、権限フロー、インストールバナー、各種フック・サービス呼び出しを統括。
- `frontend/src/hooks/useTrackRecorder.ts` は `navigator.geolocation` を監視し、速度（5 m/s 超で高速扱い）に応じて送信間隔を切り替えつつハフサイン計算で距離を測定。
- `frontend/src/hooks/useLiveTracks.ts` は直近 15 分間のデータをポーリングし、トラック単位にグルーピング。
- `frontend/src/components/MapView.tsx` が GeoJSON ソースを管理し、リサイズ監視やポップアップ表示を実装。
- Amplify の設定と GraphQL ドキュメントは `frontend/src/amplify/` 配下に整理。

### バックエンド（Amplify）
- GraphQL スキーマ（`schema.graphql` と `amplify/backend/api/postflyers/schema.graphql`）は `Session` と `TrackPoint` モデルを公開 IAM で利用できるよう定義。
- `Session` は参加者の開始・終了時刻やデバイス ID を保持し、`TrackPoint` は `trackId + ts + pointId` を主キーに位置情報を格納。
- `amplify/team-provider-info.json` には `dev` 環境（AppId: `d2dpxdlim8zvwd`、リージョン: `ap-northeast-1`）のメタデータを保存。
- サブスクリプションは無効化されており、クライアントはポーリングで最新状態を取得。独自リゾルバを追加する場合は `amplify/backend/api/postflyers/resolvers/` で上書き可能。

## ディレクトリ構成
| パス | 説明 |
| --- | --- |
| `frontend/` | React 19 + Vite クライアント、PWA 資産、サービスワーカー設定。 |
| `frontend/src/hooks/` | 位置情報記録、ライブポーリング、PWA インストール用フック群。 |
| `frontend/src/services/` | Amplify GraphQL クライアントをラップする `appsyncService.ts`。 |
| `frontend/src/components/MapView.tsx` | 自分・他参加者・履歴を同時描画する MapLibre コンポーネント。 |
| `src/` | Amplify が生成した `aws-exports` と GraphQL ドキュメント（他ツールとの連携用）。 |
| `amplify/` | Amplify CLI が管理するインフラ定義と各環境のメタデータ。 |
| `schema.graphql` | デプロイ済み GraphQL API の SDL をチェックインしたもの。 |

## 必要条件
- Node.js 20.x（Vite 7・React 19 は最新の ES Modules を前提に動作）。
- npm 10.x（Node 20 同梱）または pnpm / yarn 等のパッケージマネージャー。
- Amplify CLI コマンドと AppSync / DynamoDB を操作できる AWS 資格情報。
- Amplify CLI v12 以上（`npm install -g @aws-amplify/cli` で導入可能）。

## セットアップ手順

### 1. バックエンド（Amplify）
1. Amplify CLI をインストール: `npm install -g @aws-amplify/cli`
2. 既存の `dev` 環境を取得（対象 AWS アカウントへのアクセスが必要）:
   ```bash
   amplify pull --appId d2dpxdlim8zvwd --envName dev
   ```
   新規構築する場合は `amplify init` 後に `amplify push` を実行。スキーマ変更時も同様に `amplify push` で反映。
3. `src/` に生成される `aws-exports` と `amplifyconfiguration` が環境と合致しているか確認し、必要に応じて `frontend/src/` にコピー（`amplify pull --frontend javascript` を使えば自動同期も可能）。

### 2. フロントエンド
1. `cd frontend`
2. 依存パッケージをインストール: `npm install`
3. `.env.local`（または `.env`）を作成し、GraphQL エンドポイントと Cognito Identity Pool を設定:
   ```bash
   VITE_AWS_REGION=ap-northeast-1
   VITE_APPSYNC_URL=https://<appsync-id>.appsync-api.ap-northeast-1.amazonaws.com/graphql
   VITE_COGNITO_IDENTITY_POOL_ID=ap-northeast-1:<identity-pool-id>
   ```
   値は `frontend/src/aws-exports.ts` と一致させてください。
4. 開発サーバーを起動: `npm run dev`
5. 型チェック付きビルド: `npm run build`
6. lint 実行（任意）: `npm run lint`

### 3. 更新のデプロイ
- バックエンド変更後は `amplify push` を忘れず実行し、生成ファイルをフロントにも反映。
- フロントエンド成果物（`frontend/dist/`）は Amplify Hosting や S3 + CloudFront など任意のホスティング先へ配備。`amplify.yml` にビルド・アーティファクト圧縮の参考例あり。

## 実行時の挙動
1. **セッション初期化**: 初回起動時に `localStorage` にデバイス UUID を生成・保存し、未完了セッションがあれば復元。`ensureAmplifyConfigured` で Amplify を初期化。
2. **権限チェック**: `navigator.permissions` を利用して位置情報パーミッションの状態を確認し、拒否・未対応・タイムアウトなどケース別メッセージを表示。
3. **位置情報記録**: `createSession` ミューテーションでセッション開始後、`useTrackRecorder` が地理座標を監視し、ハフサイン距離と速度を算出しながらバッファへ蓄積。
   - `FAST_FLUSH_INTERVAL_MS`（15 秒）で移動時の高速フラッシュ、`SLOW_FLUSH_INTERVAL_MS`（60 秒）で待機時の低頻度フラッシュ。
   - `SLOW_MOVEMENT_MIN_DISTANCE_M` と `SLOW_MOVEMENT_MIN_INTERVAL_MS` により、長時間停滞しても約 3 分ごとに最低 1 点を記録。
   - オフライン時は送信を保留し、`online` イベント発火で即時再送。
   - セッション終了時は最終フラッシュを強制実行。
4. **ライブ表示**: `useLiveTracks` が 15〜60 秒間隔（移動速度に合わせて変動）で `listTrackPointsByTime` を呼び出し、直近 15 分のポイントを取得・ソート・セッション別にグループ化。
5. **履歴再生**: 履歴パネルは日付範囲を指定して `listTrackPointsByTime` を呼び出し、最大 5,000 点を取得。ニックネームごとの投稿数ランキングも生成。
6. **インストール体験**: `usePwaInstallPrompt` がインストールバナーを制御。対応ブラウザーではネイティブプロンプト、iOS Safari では手動案内を表示し、`localStorage` に解除状態を記録。

## マップ描画のポイント
- ベースマップ: Carto Positron GL スタイル（`https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`）。
- 使用ソースとレイヤー:
  - `self-track`（ライン）と `self-point`（円）は自分の現在地と軌跡を強調。
  - `peers` は他参加者のラインと最終位置を描画。
  - `history` は履歴ポイントを保持し、ホバーやクリックでポップアップ表示。
- ナビゲーション、現在地追跡、スケールバー、コンパクト属性表示を追加。`ResizeObserver` でパネルサイズ変化に追随。

## GraphQL 操作
| 操作名 | 目的 | 認証 |
| --- | --- | --- |
| `createSession` | ニックネーム・デバイス ID・開始時刻で新規セッションを登録。 | IAM ゲスト（`allowGuestAccess: true`） |
| `endSession`（`updateSession`） | セッションの `endedAt` を設定して終了状態へ更新。 | IAM ゲスト |
| `createTrackPoint` | `trackId`・`pointId`・緯度経度など 1 点の位置情報を保存。 | IAM ゲスト |
| `listTrackPointsByTime` | 指定期間のポイントを取得（ライブ表示・履歴再生に利用）。 | IAM ゲスト |
| `listTrackPoints` | 1 トラックのポイントを `from`/`to` 範囲と昇順で取得。 | IAM ゲスト |
| `listSessionsByTime` | 指定期間に開始したセッション一覧を取得（UI では未使用）。 | IAM ゲスト |

Amplify Transformer が DynamoDB テーブルを自動生成し、スキーマで定義した複合キーやインデックスを反映します。

## PWA メモ
- `vite-plugin-pwa` は `autoUpdate` でサービスワーカーを登録し、ショートカットやスクリーンショットをマニフェストに定義。
- サービスワーカーは同一オリジンを `NetworkFirst` 戦略でキャッシュ。API 追加や大きなアセットを扱う場合は `vite.config.ts` の `runtimeCaching` を調整。
- アイコンやスクリーンショットを変更した際はマニフェストのバージョン更新を忘れずに。

## トラブルシューティング
- **位置情報が許可されない**: ブラウザー／OS の位置情報設定を再確認。iOS Safari ではサイトごとに「正確な位置情報」を有効にする必要があります。
- **ゲスト認証が失敗する**: Identity Pool の未認証アクセス許可と、未認証ロールに `appsync:GraphQL` 権限が付与されているか確認。
- **ライブデータが更新されない**: ブラウザータブがバックグラウンドで休止していないか確認し、必要であれば `useLiveTracks` のポーリング間隔を短縮。
- **履歴が欠落する**: 取得範囲や `limit` を増やし、DynamoDB の読み込みキャパシティも調整してください。

## よく使う npm スクリプト
- `npm run dev` : Vite 開発サーバーを起動（HMR 対応）。
- `npm run build` : 型チェックを実施しつつ本番ビルド。
- `npm run preview` : ビルド済み成果物をローカルでプレビュー。
- `npm run lint` : ESLint による静的解析。

コンポーネント単位の詳細は `frontend/src/` のコメントや上記セクションを参照してください。
