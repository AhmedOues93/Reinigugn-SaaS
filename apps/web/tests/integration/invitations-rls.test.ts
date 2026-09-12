import { createHash, randomBytes, randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_ANON_KEY;
const ownerA = process.env.TEST_USER_A_EMAIL;
const passwordA = process.env.TEST_USER_A_PASSWORD;
const ownerB = process.env.TEST_USER_B_EMAIL;
const passwordB = process.env.TEST_USER_B_PASSWORD;
const integration = url && key && ownerA && passwordA && ownerB && passwordB ? describe : describe.skip;

integration('invitation RLS', () => {
  it('prevents a second company from resending another company invitation', async () => {
    const clientA = createClient(url!, key!); const clientB = createClient(url!, key!);
    await clientA.auth.signInWithPassword({ email: ownerA!, password: passwordA! });
    await clientB.auth.signInWithPassword({ email: ownerB!, password: passwordB! });
    const token = randomBytes(32).toString('base64url'); const suffix = randomUUID().slice(0, 8);
    const { data: invitation, error: inviteError } = await clientA.rpc('create_employee_invitation', {
      p_email: `phase3-${suffix}@example.test`, p_first_name: 'RLS', p_last_name: 'Test', p_phone: '', p_role: 'EMPLOYEE', p_employee_number: '', p_weekly_hours: null, p_employment_start_date: null, p_notes: '',
      p_token_hash: createHash('sha256').update(token).digest('hex'), p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(inviteError).toBeNull();
    const { error: crossCompanyError } = await clientB.rpc('resend_company_invitation', {
      p_member_id: invitation![0]!.member_id, p_token_hash: createHash('sha256').update(`${token}retry`).digest('hex'), p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(crossCompanyError).not.toBeNull();
  });
});
