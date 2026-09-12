import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_ANON_KEY;
const userA = process.env.TEST_USER_A_EMAIL;
const passwordA = process.env.TEST_USER_A_PASSWORD;
const userB = process.env.TEST_USER_B_EMAIL;
const passwordB = process.env.TEST_USER_B_PASSWORD;

const ready = Boolean(url && key && userA && passwordA && userB && passwordB);
const integration = ready ? describe : describe.skip;

integration('tenant RLS', () => {
  it('isolates customers and cleaning objects across companies', async () => {
    const clientA = createClient(url!, key!);
    const clientB = createClient(url!, key!);
    const [{ data: sessionA }, { data: sessionB }] = await Promise.all([
      clientA.auth.signInWithPassword({ email: userA!, password: passwordA! }),
      clientB.auth.signInWithPassword({ email: userB!, password: passwordB! }),
    ]);
    expect(sessionA.user).not.toBeNull();
    expect(sessionB.user).not.toBeNull();

    const [{ data: profileA }, { data: profileB }] = await Promise.all([
      clientA.from('profiles').select('id').eq('auth_user_id', sessionA.user!.id).single(),
      clientB.from('profiles').select('id').eq('auth_user_id', sessionB.user!.id).single(),
    ]);
    const [{ data: membershipA }, { data: membershipB }] = await Promise.all([
      clientA.from('company_members').select('company_id').eq('profile_id', profileA!.id).single(),
      clientB.from('company_members').select('company_id').eq('profile_id', profileB!.id).single(),
    ]);
    const suffix = crypto.randomUUID().slice(0, 8);
    const { data: customerA, error: customerAError } = await clientA.from('customers')
      .insert({ company_id: membershipA!.company_id, name: `RLS Kunde A ${suffix}` }).select('id').single();
    const { data: customerB, error: customerBError } = await clientB.from('customers')
      .insert({ company_id: membershipB!.company_id, name: `RLS Kunde B ${suffix}` }).select('id').single();
    expect(customerAError).toBeNull();
    expect(customerBError).toBeNull();

    const { data: customerFromB, error: customerReadError } = await clientB
      .from('customers')
      .select('id')
      .eq('id', customerA!.id);
    expect(customerReadError).toBeNull();
    expect(customerFromB).toEqual([]);

    const { error: invalidObjectError } = await clientB.from('cleaning_objects').insert({
      company_id: membershipB!.company_id,
      customer_id: customerA!.id,
      name: `Ungueltiges Objekt ${suffix}`,
    });
    expect(invalidObjectError).not.toBeNull();

    const { data: objectA, error: objectAError } = await clientA.from('cleaning_objects')
      .insert({ company_id: membershipA!.company_id, customer_id: customerA!.id, name: `RLS Objekt A ${suffix}` }).select('id, is_active').single();
    expect(objectAError).toBeNull();
    const { data: objectFromB, error: objectReadError } = await clientB.from('cleaning_objects').select('id').eq('id', objectA!.id);
    expect(objectReadError).toBeNull();
    expect(objectFromB).toEqual([]);

    const { error: objectArchiveError } = await clientA.from('cleaning_objects').update({ is_active: false }).eq('id', objectA!.id);
    expect(objectArchiveError).toBeNull();
    const { data: archivedObject } = await clientA.from('cleaning_objects').select('is_active').eq('id', objectA!.id).single();
    expect(archivedObject?.is_active).toBe(false);
    const { error: objectReactivateError } = await clientA.from('cleaning_objects').update({ is_active: true }).eq('id', objectA!.id);
    expect(objectReactivateError).toBeNull();

    const { error: archiveError } = await clientA.from('customers').update({ is_active: false }).eq('id', customerA!.id);
    expect(archiveError).toBeNull();
    const { data: archived } = await clientA.from('customers').select('is_active').eq('id', customerA!.id).single();
    expect(archived?.is_active).toBe(false);
    const { error: reactivateError } = await clientA.from('customers').update({ is_active: true }).eq('id', customerA!.id);
    expect(reactivateError).toBeNull();
    expect(customerB).not.toBeNull();
  });
});
