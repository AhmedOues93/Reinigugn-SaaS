'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import type { CatalogItem } from '@/lib/kalkulation';
import { t, type Locale } from '@/lib/i18n';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name?: string; label?: string };

export function NewCalculationForm({
  action,
  customers,
  objects,
  catalog,
  surveys,
  preferredSurveyId,
  preferredCustomerId,
  preferredObjectId,
  preferredLeadId,
  leadDefaults,
  locale,
}: {
  action: Action;
  customers: Option[];
  objects: { id: string; customerId: string; name: string }[];
  catalog: CatalogItem[];
  surveys: { id: string; label: string }[];
  preferredSurveyId?: string;
  preferredCustomerId?: string;
  preferredObjectId?: string;
  preferredLeadId?: string;
  leadDefaults?: {
    organisation: string;
    contactPerson: string;
    email: string;
    phone: string;
    street: string;
    postalCode: string;
    city: string;
    cleaningType: string;
    desiredStart: string;
    frequency: string;
  };
  locale: Locale;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fromSurvey, setFromSurvey] = useState(Boolean(preferredSurveyId));
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING'>(preferredCustomerId ? 'EXISTING' : 'NEW');
  const [customerId, setCustomerId] = useState(preferredCustomerId ?? '');
  const [cleaningObjectId, setCleaningObjectId] = useState(preferredObjectId ?? '');
  const selectedCustomerName = useMemo(
    () => customers.find((customer) => customer.id === customerId)?.name ?? customers.find((customer) => customer.id === customerId)?.label ?? '',
    [customerId, customers],
  );
  const selectedObjectName = useMemo(
    () => objects.find((object) => object.id === cleaningObjectId)?.name ?? '',
    [cleaningObjectId, objects],
  );

  function nextStep() {
    const container = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const fields = Array.from(container?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') ?? []);
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    setStep((Math.min(3, step + 1)) as 1 | 2 | 3);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      {preferredLeadId && <input type="hidden" name="lead_id" value={preferredLeadId} />}

      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-muted/25 p-3">
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
          <span className={step === 1 ? 'text-primary' : 'text-muted-foreground'}>{'1. ' + t(locale, 'sales.quote.stepCustomer')}</span>
          <span className={step === 2 ? 'text-primary' : 'text-muted-foreground'}>{'2. ' + t(locale, 'sales.quote.stepService')}</span>
          <span className={step === 3 ? 'text-primary' : 'text-muted-foreground'}>{'3. ' + t(locale, 'sales.quote.stepReview')}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: step === 1 ? '33.33%' : step === 2 ? '66.66%' : '100%' }} />
        </div>
      </div>

      <div data-step="1" className={step === 1 ? 'mx-auto block max-w-2xl' : 'hidden'} aria-hidden={step !== 1}>
      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
        <div className="mb-5">
          <h2 className="font-semibold">{t(locale, 'sales.quote.stepCustomer')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(locale, 'sales.quote.newSubtitle')}</p>
        </div>
        {!fromSurvey && preferredLeadId && leadDefaults ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/25 p-4">
              <p className="font-semibold">{leadDefaults.organisation}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[leadDefaults.contactPerson, leadDefaults.email, leadDefaults.phone].filter(Boolean).join(' · ') || '—'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[leadDefaults.street, leadDefaults.postalCode, leadDefaults.city].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
            <input type="hidden" name="customer_mode" value={preferredCustomerId ? 'EXISTING' : 'NEW'} />
            {preferredCustomerId && <input type="hidden" name="customer_id" value={preferredCustomerId} />}
            {preferredObjectId && <input type="hidden" name="cleaning_object_id" value={preferredObjectId} />}
            {!preferredCustomerId && (
              <>
                <input type="hidden" name="organisation" value={leadDefaults.organisation} />
                <input type="hidden" name="contact_person" value={leadDefaults.contactPerson} />
                <input type="hidden" name="email" value={leadDefaults.email} />
                <input type="hidden" name="phone" value={leadDefaults.phone} />
                <input type="hidden" name="street" value={leadDefaults.street} />
                <input type="hidden" name="postal_code" value={leadDefaults.postalCode} />
                <input type="hidden" name="city" value={leadDefaults.city} />
              </>
            )}
          </div>
        ) : !fromSurvey ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-border p-4 has-[:checked]:border-primary">
                <input type="radio" name="customer_mode" value="NEW" checked={customerMode === 'NEW'} onChange={() => setCustomerMode('NEW')} className="sr-only" />
                <span className="block text-sm font-semibold">{t(locale, 'sales.quote.customerModeNew')}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t(locale, 'sales.quote.customerModeNewBody')}</span>
              </label>
              <label className="cursor-pointer rounded-xl border border-border p-4 has-[:checked]:border-primary">
                <input type="radio" name="customer_mode" value="EXISTING" checked={customerMode === 'EXISTING'} onChange={() => setCustomerMode('EXISTING')} className="sr-only" />
                <span className="block text-sm font-semibold">{t(locale, 'sales.quote.customerModeExisting')}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t(locale, 'sales.quote.customerModeExistingBody')}</span>
              </label>
            </div>
            {customerMode === 'EXISTING' ? (
              <>
              <Field label={t(locale, 'sales.quote.selectCustomer')} htmlFor="customer_id">
                <Select id="customer_id" name="customer_id" required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">{t(locale, 'sales.quote.selectCustomer')}</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name ?? customer.label}</option>)}
                </Select>
              </Field>
                {customerId && objects.some((object) => object.customerId === customerId) && (
                  <Field label={t(locale, 'sales.quote.selectObject')} htmlFor="cleaning_object_id" info={t(locale, 'sales.quote.objectReuseInfo')}>
                    <Select id="cleaning_object_id" name="cleaning_object_id" value={cleaningObjectId} onChange={(event) => setCleaningObjectId(event.target.value)}>
                      <option value="">{t(locale, 'sales.quote.newObject')}</option>
                      {objects.filter((object) => object.customerId === customerId).map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
                    </Select>
                  </Field>
                )}
                {customerId && !cleaningObjectId && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field className="sm:col-span-2" label={t(locale, 'sales.quote.objectName')} htmlFor="object_name">
                      <Input id="object_name" name="object_name" required minLength={2} maxLength={160} placeholder={t(locale, 'sales.quote.objectName')} />
                    </Field>
                    <Field className="sm:col-span-2" label={t(locale, 'sales.quote.street')} htmlFor="object_street">
                      <Input id="object_street" name="object_street" required maxLength={160} />
                    </Field>
                    <Field label={t(locale, 'sales.quote.postalCode')} htmlFor="object_postal_code">
                      <Input id="object_postal_code" name="object_postal_code" required maxLength={16} />
                    </Field>
                    <Field label={t(locale, 'sales.quote.city')} htmlFor="object_city">
                      <Input id="object_city" name="object_city" required maxLength={120} />
                    </Field>
                  </div>
                )}
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2" label={t(locale, 'sales.quote.organisation')} htmlFor="organisation"><Input id="organisation" name="organisation" required minLength={2} maxLength={160} /></Field>
                <Field label={t(locale, 'sales.quote.contact')} htmlFor="contact_person"><Input id="contact_person" name="contact_person" maxLength={160} /></Field>
                <Field label={t(locale, 'sales.quote.email')} htmlFor="email"><Input id="email" name="email" type="email" maxLength={160} /></Field>
                <Field label={t(locale, 'sales.quote.phone')} htmlFor="phone"><Input id="phone" name="phone" maxLength={64} /></Field>
                <Field label={t(locale, 'sales.quote.street')} htmlFor="street"><Input id="street" name="street" maxLength={160} /></Field>
                <Field label={t(locale, 'sales.quote.postalCode')} htmlFor="postal_code"><Input id="postal_code" name="postal_code" maxLength={16} /></Field>
                <Field label={t(locale, 'sales.quote.city')} htmlFor="city"><Input id="city" name="city" maxLength={120} /></Field>
              </div>
            )}
          </>
        ) : null}

        <Field label={t(locale, 'sales.quote.label')} htmlFor="title" info={t(locale, 'sales.quote.labelInfo')}>
          <Input id="title" name="title" required minLength={2} maxLength={160} defaultValue={leadDefaults?.organisation ?? ''} placeholder={t(locale, 'sales.quote.label')} />
        </Field>

        {surveys.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="survey" checked={fromSurvey} onChange={() => setFromSurvey(true)} />
              {t(locale, 'sales.quote.fromSurvey')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="blank" checked={!fromSurvey} onChange={() => setFromSurvey(false)} />
              {t(locale, 'sales.quote.directInput')}
            </label>
          </div>
        )}

        {fromSurvey && surveys.length > 0 ? (
          <Field
            label={t(locale, 'sales.quote.survey')}
            htmlFor="site_survey_id"
            info={t(locale, 'sales.quote.surveyInfo')}
          >
            <Select id="site_survey_id" name="site_survey_id" required defaultValue={preferredSurveyId ?? ""}>
              <option value="">{t(locale, 'sales.quote.selectSurvey')}</option>
              {surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

      </section>
      </div>

      <div data-step="2" className={step === 2 ? 'mx-auto block max-w-2xl' : 'hidden'} aria-hidden={step !== 2}>
      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
        <div className="mb-5">
          <h2 className="font-semibold">{t(locale, 'sales.quote.stepService')}</h2>
        </div>
        {!fromSurvey && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(locale, 'sales.quote.cleaningType')} htmlFor="cleaning_type"><Select id="cleaning_type" name="cleaning_type" defaultValue={leadDefaults?.cleaningType ?? ''}><option value="">{t(locale, 'sales.quote.open')}</option><option value="Unterhaltsreinigung">{t(locale, 'sales.cleaning.MAINTENANCE')}</option><option value="Büroreinigung">{t(locale, 'sales.cleaning.OFFICE')}</option><option value="Grundreinigung">{t(locale, 'sales.cleaning.DEEP')}</option><option value="Glasreinigung">{t(locale, 'sales.cleaning.GLASS')}</option><option value="Treppenhausreinigung">{t(locale, 'sales.cleaning.STAIRCASE')}</option><option value="Sanitärreinigung">{t(locale, 'sales.cleaning.SANITARY')}</option><option value="Sonderreinigung">{t(locale, 'sales.cleaning.SPECIAL')}</option></Select></Field>
            <Field label={t(locale, 'sales.quote.frequency')} htmlFor="frequency"><Select id="frequency" name="frequency" defaultValue={leadDefaults?.frequency ?? ''}><option value="">{t(locale, 'sales.quote.open')}</option><option value="Einmalig">{t(locale, 'sales.frequency.ONCE')}</option><option value="1x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_1')}</option><option value="2x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_2')}</option><option value="3x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_3')}</option><option value="5x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_5')}</option><option value="Monatlich">{t(locale, 'sales.frequency.MONTHLY')}</option></Select></Field>
            <Field label={t(locale, 'sales.quote.desiredStart')} htmlFor="desired_start"><Input id="desired_start" name="desired_start" type="date" defaultValue={leadDefaults?.desiredStart ?? ''} /></Field>
          </div>
        )}
        <Field
          label={t(locale, 'sales.quote.serviceTemplate')}
          htmlFor="catalog_item_id"
          info={t(locale, 'sales.quote.serviceTemplateInfo')}
        >
          <Select id="catalog_item_id" name="catalog_item_id" defaultValue={catalog[0]?.id ?? ''}>
            <option value="">{t(locale, 'sales.quote.customService')}</option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category ? `${item.category} · ${item.name}` : item.name}
              </option>
            ))}
          </Select>
        </Field>

        {catalog.length === 0 && (
          <p className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-sm leading-6 text-muted-foreground">
            {t(locale, 'sales.quote.noTemplate')}
          </p>
        )}
      </section>
      </div>

      <div data-step="3" className={step === 3 ? 'mx-auto block max-w-2xl' : 'hidden'} aria-hidden={step !== 3}>
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(locale, 'sales.quote.reviewCustomer')}</p>
            <p className="mt-1 font-semibold">
              {fromSurvey ? t(locale, 'sales.quote.fromSurveyShort') : customerMode === 'EXISTING' ? (selectedCustomerName || t(locale, 'sales.quote.customerModeExisting')) : t(locale, 'sales.quote.customerModeNew')}
            </p>
            {selectedObjectName && <p className="mt-1 text-sm text-muted-foreground">{selectedObjectName}</p>}
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(locale, 'sales.quote.reviewNext')}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t(locale, 'sales.quote.reviewBody')}
            </p>
          </div>
        </div>
      </div>

      <div className="sticky bottom-3 z-10 mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
        {step === 1 ? (
          <span />
        ) : (
          <Button type="button" variant="outline" onClick={() => setStep((step - 1) as 1 | 2 | 3)}>
            <ChevronLeft className="size-4" />{t(locale, 'sales.quote.back')}
          </Button>
        )}
        {step < 3 ? (
          <Button type="button" onClick={nextStep}>
            {t(locale, 'sales.quote.next')}<ChevronRight className="size-4" />
          </Button>
        ) : (
          <SubmitButton locale={locale}>{t(locale, 'sales.quote.toCalculation')}</SubmitButton>
        )}
      </div>
    </form>
  );
}
