// Heuristic: was this error caused by stale/revoked cookies?
//
// We mark the account as `expired` so claim_account stops handing it out
// and the UI in /accounts surfaces the bad state. Patterns covered:
// - 401 on the OAuth-protected Flow API (`AUTH_ERROR_401`, `UNAUTHENTICATED`)
// - puppeteer landed on Google's sign-in page after navigating to Flow
//   (`Failed to obtain Flow projectId` + URL contains accounts.google.com)
// - explicit "Sign in - Google Accounts" page title in the bridge
export function isCookiesExpiredError(msg: string): boolean {
  if (!msg) return false;
  if (/AUTH_ERROR_401|UNAUTHENTICATED/.test(msg)) return true;
  if (/Failed to obtain Flow projectId/.test(msg)) return true;
  if (/accounts\.google\.com\/.*signin|ServiceLogin/i.test(msg)) return true;
  if (/Sign\s*in\s*-\s*Google Accounts/i.test(msg)) return true;
  return false;
}
