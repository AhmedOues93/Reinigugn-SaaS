import { ShieldCheck } from 'lucide-react';
import { Notice, PageHeader, Section } from '@/components/ui';
import { getCurrentCompany, requireOwnerCompany } from '@/lib/auth';
import { CompanySettingsForm } from '@/components/company-settings-form';
import { CompanyBrandingForm } from '@/components/company-branding-form';
import { AccountPasswordForm } from '@/components/account-password-form';
import { getCompanyBranding } from '@/lib/data/branding';
import { getQuote, listQuotes } from '@/lib/data/sales';
import { removeCompanyLogo, updateCompanyBranding, updateCompanySettings } from './actions';

export default async function SettingsPage() {
  const { membership, supabase } = await getCurrentCompany();
  if (!membership) return null;
  const company = membership.companies as unknown as { id: string; name: string };

  if (membership.role !== 'OWNER') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Einstellungen"
          description="Unternehmens-, Rechnungs- und Systemeinstellungen."
        />
        <Notice tone="neutral" icon={<ShieldCheck />} title="Nur für den Inhaber">
          Firmendaten dürfen nur durch den Inhaber des Unternehmens bearbeitet werden.
        </Notice>
        <Section title="Konto und Sicherheit" description="Passwort und Anmelde-E-Mail sicher verwalten.">
          <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
            <AccountPasswordForm />
          </div>
        </Section>
      </div>
    );
  }

  await requireOwnerCompany();
  const { data } = await supabase
    .from('companies')
    .select(
      'id, name, legal_form, managing_director, street, postal_code, city, country, phone, email, website, tax_number, vat_id, billing_email, iban, bic, default_payment_terms_days, default_vat_rate_basis_points, service_focus, timezone, default_language, default_hourly_rate_cents',
    )
    .eq('id', company.id)
    .single();
  const [branding, recentQuotes] = await Promise.all([
    getCompanyBranding(company.id),
    listQuotes('all'),
  ]);
  const previewSource = recentQuotes[0] ? await getQuote(recentQuotes[0].id) : null;
  const recipient = previewSource?.recipient_snapshot && typeof previewSource.recipient_snapshot === 'object'
    ? previewSource.recipient_snapshot as Record<string, unknown>
    : null;
  const previewQuote = previewSource ? {
    quote_number: previewSource.quote_number,
    title: previewSource.title,
    currency: previewSource.currency,
    net_total_cents: previewSource.net_total_cents,
    vat_total_cents: previewSource.vat_total_cents,
    gross_total_cents: previewSource.gross_total_cents,
    valid_until: previewSource.valid_until,
    recipient_name: String(recipient?.name ?? recipient?.company_name ?? 'Kunde'),
    recipient_address: [recipient?.street, recipient?.postal_code, recipient?.city].filter(Boolean).join(' '),
    lines: previewSource.lines.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unit_price_cents: line.unit_price_cents,
      gross_amount_cents: line.gross_amount_cents,
    })),
  } : null;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader
        title="Einstellungen"
        description="Diese Angaben erscheinen auf jeder Rechnung und in jedem Dokument, das Ihre Kunden erhalten."
        className="mb-0"
      />

      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
        <CompanySettingsForm
          company={data ?? { name: company.name }}
          serviceFocus={(data?.service_focus as string[] | null) ?? []}
          action={updateCompanySettings}
        />
      </div>

      <Section title="Konto und Sicherheit" description="Ändere dein persönliches Anmeldepasswort.">
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <AccountPasswordForm />
        </div>
      </Section>

      <Section
        title="Logo und Farbe"
        description="Wird in der Navigation, im Kundenportal und auf Rechnungsdokumenten verwendet."
      >
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <CompanyBrandingForm
            action={updateCompanyBranding}
            removeAction={removeCompanyLogo}
            logoUrl={branding?.logoUrl ?? null}
            brandColor={branding?.brandColor ?? null}
            companyName={data?.name ?? company.name}
            previewQuote={previewQuote}
          />
        </div>
      </Section>
    </div>
  );
}
