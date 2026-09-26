import { requireStaffCompany } from '@/lib/auth';

/**
 * First-run setup.
 *
 * The checklist is derived from what the company actually has — a customer
 * exists, a calculation exists — rather than from which wizard steps somebody
 * clicked through. A checklist that ticks itself on "weiter" teaches people to
 * stop reading it.
 */

// Re-exported so server components can keep importing the domain from one
// place; client components import it from '@/lib/service-focus' directly.
export * from '@/lib/service-focus';

export type OnboardingStatus = {
  onboarding_completed_at: string | null;
  steps: string[];
  service_focus: string[];
  has_company_address: boolean;
  has_tax_details: boolean;
  has_calculation_defaults: boolean;
  has_catalog: boolean;
  has_customer: boolean;
  has_object: boolean;
  has_employee: boolean;
  has_survey: boolean;
  has_calculation: boolean;
  has_quote: boolean;
};

export async function getOnboardingStatus(): Promise<OnboardingStatus | null> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('get_onboarding_status');
  if (error) return null;
  return ((data ?? []) as OnboardingStatus[])[0] ?? null;
}

export type CompanyProfile = {
  name: string;
  legal_form: string | null;
  managing_director: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tax_number: string | null;
  vat_id: string | null;
  billing_email: string | null;
  iban: string | null;
  bic: string | null;
  default_payment_terms_days: number | null;
  default_vat_rate_basis_points: number;
  service_focus: string[];
};

export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const { supabase, company } = await requireStaffCompany();
  const { data } = await supabase
    .from('companies')
    .select(
      'name, legal_form, managing_director, street, postal_code, city, country, phone, email, website, tax_number, vat_id, billing_email, iban, bic, default_payment_terms_days, default_vat_rate_basis_points, service_focus',
    )
    .eq('id', company.id)
    .maybeSingle();
  return (data as CompanyProfile | null) ?? null;
}

/**
 * Whether to put a new owner through the wizard.
 *
 * Only once, and only for the OWNER: an OFFICE colleague joining later should
 * land in the application, not in somebody else's company setup.
 */
export function shouldRunOnboarding(status: OnboardingStatus | null, role: string) {
  if (role !== 'OWNER') return false;
  if (!status) return false;
  return status.onboarding_completed_at === null;
}
