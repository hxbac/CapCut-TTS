/**
 * マルチセッション運用時の 1 アカウント分の設定
 * 各アカウントは独立した user-agent / proxy(IP) / session ファイルを持ち、
 * それぞれが別ブラウザのように振る舞うことでレート制限を分散させる
 */
export interface CapCutAccountConfig {
  /** ログや session ファイル名に使う識別子 */
  id: string;
  email: string;
  password: string;
  /** このアカウント専用の User-Agent */
  userAgent: string;
  /** このアカウント専用の egress proxy (例: http://user:pass@host:port) */
  proxyUrl?: string;
  /** このアカウント専用の session 永続化ファイル */
  sessionStorePath: string;
  deviceId?: string;
  tdid?: string;
  verifyFp?: string;
}
