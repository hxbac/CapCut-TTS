# Multi-session & avoiding rate limits

CapCut throttles per **account**, per **device fingerprint** and, aggressively,
per **egress IP**. A single account behind a single IP will hit limits under
sustained load. This server can therefore run a **pool of independent sessions**
and rotate between them.

Each session is a fully independent "browser":

| Per-session isolation | Where it comes from |
| --------------------- | ------------------- |
| Account (email/password) | `accounts[].email` / `accounts[].password` |
| **User-Agent** | `accounts[].userAgent` |
| **IP / egress proxy** | `accounts[].proxyUrl` |
| Cookies + `deviceId` + `verifyFp` | separate `capcut-session.<id>.json` file |

The request layer rotates accounts **round-robin**. When a request hits a rate
limit (HTTP 429 or a quota/"too many requests" error), that account is put on a
short cooldown and the request is retried on the next account automatically.

## Setup

1. Copy the example and fill in your accounts:

   ```bash
   cp capcut-accounts.example.json capcut-accounts.json
   ```

2. Edit `capcut-accounts.json`:

   ```json
   {
     "accounts": [
       {
         "id": "acc1",
         "email": "acc1@example.com",
         "password": "secret1",
         "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/146.0.0.0 Safari/537.36",
         "proxyUrl": "http://user:pass@proxy-host-1:8080"
       },
       {
         "id": "acc2",
         "email": "acc2@example.com",
         "password": "secret2",
         "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ... Safari/605.1.15",
         "proxyUrl": "http://user:pass@proxy-host-2:8080"
       }
     ]
   }
   ```

   Field reference:

   | Field | Required | Notes |
   | ----- | -------- | ----- |
   | `id` | no | Identifier for logs + session file name. Defaults to `account-N`. Must be unique. |
   | `email` / `password` | **yes** | CapCut credentials. |
   | `userAgent` | no | Defaults to global `USER_AGENT`. **Give each account a distinct UA.** |
   | `proxyUrl` | no | `http(s)://[user:pass@]host:port` (SOCKS also supported by undici). No proxy = server's own IP. |
   | `sessionStorePath` | no | Defaults to `capcut-session.<id>.json`. |
   | `deviceId` / `tdid` / `verifyFp` | no | Pin a fingerprint; otherwise generated + persisted per session. |

3. Start the server. On boot it warms up **all** sessions in parallel and logs
   the pool size. The public API (`/v2/...`) is unchanged — routing is internal.

> The path is configurable via `CAPCUT_ACCOUNTS_PATH`. If the file is absent or
> empty, the server falls back to the single `CAPCUT_EMAIL` / `CAPCUT_PASSWORD`
> account (fully backward compatible).

`capcut-accounts.json` is git-ignored because it contains credentials + proxy
auth. Keep it out of version control.

## Practical guidance to avoid hitting limits

1. **One IP per account is what matters most.** Reusing the same proxy across
   many accounts recreates the bottleneck — CapCut sees one IP. Prefer 1 account
   ↔ 1 residential/mobile proxy. Datacenter IPs are flagged fastest.
2. **Distinct User-Agent per account**, and keep it stable for that account
   (don't rotate UA every request — a session that changes fingerprint mid-life
   looks more suspicious than a consistent one).
3. **Scale accounts to throughput.** Each CapCut account has its own quota; more
   accounts ≈ linearly more headroom. Add accounts before pushing any single one
   hard.
4. **Let cooldown do its job.** On a 429 the pool sidelines that account for
   `RATE_LIMIT_COOLDOWN_MS` (60s) and retries elsewhere. If *all* accounts are
   cooled down the request fails fast rather than hammering — add capacity.
5. **Cache aggressively.** Speaker lists and speaker previews are already cached;
   cache synthesized audio for identical `(text, speaker, params)` on your side
   to avoid re-billing the upstream at all.
6. **Throttle bursts.** Smooth traffic (a small concurrency cap / queue in your
   client) beats spiky bursts that trip per-minute limits on every account at
   once.
