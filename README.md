# 訪問介護スケジュール管理ツール (houmonkaigo_schedule)

訪問介護事業所向けの **スケジュール管理 + AIアシスタント** を統合したWebアプリケーションです。
ヘルパーの配置調整、サービス実績の記録、モニタリング報告書の自動生成、サービス担当者会議の欠席照会回答書の作成などを支援します。

## 主な機能

- **ダッシュボード**: 利用者数・本日の訪問予定・月次実績などの可視化
- **対話型AIアシスタント (ながらAI)**: スケジュール調整提案・キャンセル発生時の代替ヘルパー提案を自然言語で行い、1クリックで適用可能
- **利用者・スタッフ管理**: 定期スケジュール（曜日・週次/隔週）の登録
- **訪問スケジュール**: 当日の訪問一覧、ヘルパー割り当て、ステータス管理
- **実績記録**: バイタル、食事、排泄、活動、特記事項などを構造化して保存
- **ケアプラン解析**: PDF/画像/テキストを Gemini で解析し、目標を自動抽出
- **モニタリング報告書**: 1ヶ月分の訪問記録から目標達成度を自動評価
- **サービス担当者会議 照会回答書**: AIによる公的文書の自動起案

## 技術スタック

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS
- **Backend**: Express (TypeScript, `tsx` 実行)
- **Auth & DB**: Firebase Authentication + Firestore
- **AI**: Google Gemini API (`@google/genai`、サーバ側プロキシ経由)

## セットアップ

### 前提

- Node.js 20 以上を推奨
- Firebase プロジェクト（Authentication / Firestore 有効化済み）
- Google AI Studio で発行した Gemini API キー

### 手順

1. 依存関係をインストール
   ```bash
   npm install
   ```

2. 環境変数を設定（プロジェクトルートに `.env.local` を作成）
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. Firebase 設定
   - `firebase-applet-config.json` を自分の Firebase 設定で書き換え（`apiKey`, `projectId`, `firestoreDatabaseId` など）
   - Firestore セキュリティルールをデプロイ
     ```bash
     firebase deploy --only firestore:rules
     ```

4. 開発サーバ起動
   ```bash
   npm run dev
   ```
   `http://localhost:3000` でアクセス

5. 本番ビルド & 起動
   ```bash
   npm run build
   npm start
   ```

## ディレクトリ構成

```
.
├── server.ts                       # Express + Gemini API プロキシ
├── src/
│   ├── App.tsx                     # ルーティング・状態管理
│   ├── firebase.ts                 # Firebase 初期化
│   ├── types.ts                    # 型定義
│   ├── lib/
│   │   ├── firestore.ts            # Firestore エラー処理ヘルパ
│   │   ├── seedData.ts             # デモデータ投入（DEV専用）
│   │   └── utils.ts                # cn() などの汎用ユーティリティ
│   └── components/
│       ├── Dashboard.tsx           # ホーム画面 + AI対話アシスタント
│       ├── ScheduleList.tsx        # 訪問スケジュール管理
│       ├── ClientList.tsx          # 利用者管理
│       ├── StaffManagement.tsx     # スタッフ管理
│       ├── RecordForm.tsx          # 実績記録入力
│       ├── RecordHistory.tsx       # 実績記録一覧
│       ├── CarePlansAndMonitoring.tsx  # ケアプラン解析 & モニタリング
│       ├── ConferenceManagement.tsx    # 会議照会回答書
│       └── AuthGuard.tsx           # ログインゲート
├── firestore.rules                 # Firestore セキュリティルール
├── firebase-applet-config.json     # Firebase クライアント設定
└── package.json
```

## 本番運用上の注意 ⚠️

利用者の個人情報・医療情報を扱うため、本番デプロイ前に以下を必ず確認してください。

- **Firestore ルール**: 現状は「認証必須」までを担保しています。事業所間のデータ分離（マルチテナント）は未実装のため、認証済みユーザーは全データを閲覧可能です。本番運用前に `clients` / `records` / `schedules` 等に `tenantId` を追加し、テナント分離を実装してください。
- **role の改ざん耐性**: `users/{uid}.role` を Firestore ドキュメントで管理しているため、厳密にはユーザーが自分の role を書き換える可能性が残ります（現在のルールでは admin への昇格は防止）。長期運用では Firebase Auth Custom Claims への移行を推奨。
- **自動デモデータ投入**: `Dashboard.tsx` の auto-seed は `import.meta.env.DEV` の場合のみ実行されます。本番ビルド（`npm run build`）では自動投入されません。
- **GEMINI_API_KEY**: サーバ側環境変数のみで扱い、フロントに露出させないでください。本リポジトリでは `server.ts` のプロキシ経由でのみ Gemini を呼び出します。

## ライセンス

未指定。商用利用を想定する場合は明示してください。
