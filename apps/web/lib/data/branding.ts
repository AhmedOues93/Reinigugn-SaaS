import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type CompanyBranding = {
  companyId: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
};

const signedUrlTtlSeconds = 60 * 30;

/**
 * Branding for one tenant. The logo bucket is private, so the server mints a
 * short-lived signed URL; the path itself is never exposed to the browser.
 * Cached per request so a shell, a header and a document can all ask for it.
 */
export const getCompanyBranding = cache(async (companyId: string): Promise<CompanyBranding | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('companies')
    .select('id, name, logo_storage_path, brand_color')
    .eq('id', companyId)
    .maybeSingle();
  if (!data) return null;

  let logoUrl: string | null = null;
  if (data.logo_storage_path) {
    const { data: signed } = await supabase.storage
      .from('company-branding')
      .createSignedUrl(data.logo_storage_path, signedUrlTtlSeconds);
    logoUrl = signed?.signedUrl ?? null;
  }

  return { companyId: data.id, name: data.name, logoUrl, brandColor: data.brand_color ?? null };
});
