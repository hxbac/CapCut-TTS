import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import env from '@/configs/env';
import type { CapCutAccountConfig } from '@/types/capcutAccount';

/**
 * マルチセッション設定ファイルのスキーマ
 * `{ "accounts": [...] }` でも、素の配列でも受け付ける
 */
const accountEntrySchema = z.object({
  id: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(1),
  userAgent: z.string().min(1).optional(),
  proxyUrl: z.string().url().optional(),
  sessionStorePath: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  tdid: z.string().min(1).optional(),
  verifyFp: z.string().min(1).optional(),
});

const accountsFileSchema = z.union([
  z.array(accountEntrySchema),
  z.object({ accounts: z.array(accountEntrySchema) }),
]);

type AccountEntry = z.infer<typeof accountEntrySchema>;

/**
 * base の session ファイル名にアカウント id を差し込む
 * capcut-session.json -> capcut-session.<id>.json
 */
const deriveSessionStorePath = (basePath: string, id: string): string => {
  const parsed = path.parse(basePath);
  return path.join(parsed.dir, `${parsed.name}.${id}${parsed.ext}`);
};

/**
 * 設定ファイルの 1 エントリを完全な AccountConfig へ正規化する
 */
const normalizeEntry = (
  entry: AccountEntry,
  index: number
): CapCutAccountConfig => {
  const id = entry.id ?? `account-${index + 1}`;

  return {
    id,
    email: entry.email,
    password: entry.password,
    userAgent: entry.userAgent ?? env.USER_AGENT,
    proxyUrl: entry.proxyUrl,
    sessionStorePath:
      entry.sessionStorePath ??
      deriveSessionStorePath(env.CAPCUT_SESSION_STORE_PATH, id),
    deviceId: entry.deviceId,
    tdid: entry.tdid,
    verifyFp: entry.verifyFp,
  };
};

/**
 * env の単一アカウント設定を AccountConfig へ変換する（後方互換のフォールバック）
 */
const buildEnvAccount = (): CapCutAccountConfig => {
  if (!env.CAPCUT_EMAIL || !env.CAPCUT_PASSWORD) {
    throw new Error(
      'No CapCut account configured. Set CAPCUT_EMAIL / CAPCUT_PASSWORD, ' +
        `or provide an accounts file at ${env.CAPCUT_ACCOUNTS_PATH}`
    );
  }

  return {
    id: 'default',
    email: env.CAPCUT_EMAIL,
    password: env.CAPCUT_PASSWORD,
    userAgent: env.USER_AGENT,
    // 単一アカウント時は既存の session ファイルをそのまま使い、移行を不要にする
    sessionStorePath: env.CAPCUT_SESSION_STORE_PATH,
    deviceId: env.CAPCUT_DEVICE_ID,
    tdid: env.CAPCUT_TDID,
    verifyFp: env.CAPCUT_VERIFY_FP,
  };
};

/**
 * 設定ファイルがあればそれを、なければ env の単一アカウントを読み込む
 */
const loadAccounts = (): CapCutAccountConfig[] => {
  const accountsPath = path.resolve(
    process.cwd(),
    env.CAPCUT_ACCOUNTS_PATH
  );

  let raw: string;
  try {
    raw = fs.readFileSync(accountsPath, 'utf8');
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? error.code : undefined;

    if (code !== 'ENOENT') {
      throw error;
    }

    // ファイルが無いときは env 単一アカウントへフォールバック
    return [buildEnvAccount()];
  }

  const parsed = accountsFileSchema.parse(JSON.parse(raw));
  const entries = Array.isArray(parsed) ? parsed : parsed.accounts;

  if (entries.length === 0) {
    return [buildEnvAccount()];
  }

  const accounts = entries.map(normalizeEntry);

  // id の重複は session ファイルの衝突を招くので弾く
  const seenIds = new Set<string>();
  for (const account of accounts) {
    if (seenIds.has(account.id)) {
      throw new Error(`Duplicate CapCut account id: ${account.id}`);
    }
    seenIds.add(account.id);
  }

  return accounts;
};

const capCutAccounts = loadAccounts();

export default capCutAccounts;
