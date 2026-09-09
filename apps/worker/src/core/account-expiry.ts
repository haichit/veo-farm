// Heuristic: was this error caused by stale/revoked cookies?
//
// We mark the account as `expired` so claim_account stops handing it out
// and the UI in /accounts surfaces the bad state. Patterns covered:
// - 401 on the OAuth-protected Flow API (`AUTH_ERROR_401`, `UNAUTHENTICATED`)
// - puppeteer landed on Google's sign-in page after navigating to Flow
//   (`Failed to obtain Flow projectId` + URL contains accounts.google.com)
// - explicit "Sign in - Google Accounts" page title in the bridge
// - captureSession/_ensureProject bounced to Flow's logged-out marketing
//   page (flow.google.com/, /about, ...) instead of a real /project/<id>
//   page — the SID-family cookies can carry a multi-year expiry while the
//   session Google actually honours dies much sooner (short-lived rotation
//   cookies like SIDCC/__Secure-*TS don't get refreshed without a real
//   interactive browser), so this is the most common real-world "cookies
//   are actually dead" signal despite `cookies_expire_at` looking fine.
export function isCookiesExpiredError(msg: string): boolean {
  if (!msg) return false;
  if (/AUTH_ERROR_401|UNAUTHENTICATED/.test(msg)) return true;
  if (/Failed to obtain Flow projectId/.test(msg)) return true;
  if (/accounts\.google\.com\/.*signin|ServiceLogin/i.test(msg)) return true;
  if (/Sign\s*in\s*-\s*Google Accounts/i.test(msg)) return true;
  if (/page\.url\(\)=https:\/\/flow\.google\.com\/(about)?["')\s]*$/i.test(msg)) return true;
  return false;
}
