import { supabase } from './supabase.js';
import { decrypt } from './encryption.js';
import type { Account, Cookie } from '@veo-farm/shared';
import { logger } from './logger.js';

export async function claimAccount(
  userId: string,
  providerId: string,
  retries = 5,
  pinnedAccountId?: string | null,
): Promise<Account> {
  for (let i = 0; i < retries; i++) {
    const { data, error } = pinnedAccountId
      ? await supabase().rpc('claim_specific_account', {
          p_account_id: pinnedAccountId,
          p_user_id: userId,
        })
      : await supabase().rpc('claim_account', {
          p_user_id: userId,
          p_provider_id: providerId,
        });
    if (error) throw new Error(`claim_account: ${error.message}`);
    if (data && data.id) return data as Account;
    logger.info({ providerId, pinnedAccountId, attempt: i + 1 }, 'no idle account, waiting...');
    await new Promise((r) => setTimeout(r, 5000 + i * 2000));
  }
  throw new Error(
    pinnedAccountId
      ? `Pinned account ${pinnedAccountId} not idle after ${retries} retries`
      : `No idle account for provider=${providerId} after ${retries} retries`,
  );
}

export async function releaseAccount(
  accountId: string,
  cooldownSec: number,
  newStatus: 'idle' | 'expired' | 'die' | 'cooldown' = 'idle',
  errorText?: string,
) {
  const { error } = await supabase().rpc('release_account', {
    p_account_id: accountId,
    p_cooldown_sec: cooldownSec,
    p_new_status: newStatus,
    p_error: errorText ?? null,
  });
  if (error) logger.error({ err: error, accountId }, 'release_account failed');
}

export function decryptCookies(account: Account): Cookie[] {
  const json = decrypt(account.cookies_encrypted);
  return JSON.parse(json) as Cookie[];
}

/**
 * Increment today's usage counter for an account (Sprint 10 quota tracking).
 * Call after a successful video/image/voice generation. The claim_account RPC
 * skips accounts that hit their meta.daily_quota.
 */
export async function incrementAccountUsage(accountId: string): Promise<void> {
  const { error } = await supabase().rpc('increment_account_usage', {
    p_account_id: accountId,
  });
  if (error) logger.warn({ err: error.message, accountId }, 'increment_account_usage failed');
}
