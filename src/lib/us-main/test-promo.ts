import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const US_TEST_PROMO_SETTING = 'test_bundle_promo';
export const US_TEST_PROMO_TAG = 'us-bundle-dollar-v1';

export async function validateUsTestPromo(code: unknown, type: string, cents: number): Promise<boolean> {
  if (code === undefined || code === null || code === '') return false;
  if (typeof code !== 'string' || code.length > 80 || type !== 'bundle' || cents <= 100) {
    throw new Error('This testing code is only available for US reading bundles.');
  }
  const { data, error } = await getSupabaseAdmin().from('us_main_settings')
    .select('value').eq('key', US_TEST_PROMO_SETTING).maybeSingle();
  if (error) throw new Error('Unable to check the testing code. Please try again.');
  const config = data?.value;
  const supplied = crypto.createHash('sha256').update(code.trim().toUpperCase()).digest();
  if (!config?.enabled || !/^[a-f0-9]{64}$/.test(config.code_hash || '') ||
      !crypto.timingSafeEqual(supplied, Buffer.from(config.code_hash, 'hex'))) {
    throw new Error('Invalid or inactive testing code.');
  }
  return true;
}
