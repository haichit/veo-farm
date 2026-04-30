import { supabase } from './supabase.js';
import { decrypt } from './encryption.js';
import type { Account, Cookie } from '@veo-farm/shared';
import { logger } from './logger.js';

export async function claimAccount(userId: string, providerId: string, retries = 5): Promise<Account> {
  for (let i = 0; i < retries; i++) {
    const { data, error } = await supabase().rpc('claim_account', {
      p_user_id: userId,
      p_provider_id: providerId,
    });
    if (error) throw new Error(`claim_account: ${error.message}`);
    if (data && data.id) return data as Account;
    logger.info({ providerId, attempt: i + 1 }, 'no idle account, waiting...');
    await new Promise((r) => setTimeout(r, 5000 + i * 2000));
  }
  throw new Error(`No idle account for provider=${providerId} after ${retries} retries`);
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
