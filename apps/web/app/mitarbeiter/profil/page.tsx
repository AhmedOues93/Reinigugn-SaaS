import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Clock3 } from 'lucide-react';
import { Card, CardHeader, DataRow } from '@/components/ui';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { AvatarForm } from '@/components/employee/avatar-form';
import { initialsOf } from '@/components/employee/avatar';
import { EmployeeLanguagePicker } from '@/components/employee/language-picker';
import { EmployeeLogoutButton } from '@/components/employee/logout-button';
import { EmployeeContactForm } from '@/components/employee/contact-form';
import { AccountPasswordForm } from '@/components/account-password-form';
import { logout } from '@/app/(auth)/actions';
import { employeeLocale, getMyEmployeeProfile } from '@/lib/data/employee';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { removeMyAvatar, setMyAppLanguage, updateMyContactDetails, uploadMyAvatar } from '../actions';

export default async function EmployeeProfilePage() {
  const [locale, profile] = await Promise.all([employeeLocale(), getMyEmployeeProfile()]);
  if (!profile) notFound();
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <>
      <EmployeePageHeader title={t(locale, 'emp.profile.title')} subtitle={profile.companyName ?? undefined} />

      {/*
        The employee's own hours. On the profile rather than in the bottom bar:
        it is a record about them, it is read now and then rather than daily,
        and a sixth tab would crowd a phone.
      */}
      <Link
        href="/mitarbeiter/stunden"
        className="mb-4 flex min-h-touch items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Clock3 className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{t(locale, 'emp.hours.title')}</span>
            <span className="block truncate text-sm text-muted-foreground">{t(locale, 'emp.hours.intro')}</span>
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
      </Link>

      <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-5 md:space-y-0 [&>*]:md:mt-0">
        <Card className="p-5">
          <AvatarForm
            locale={locale}
            url={profile.avatarUrl}
            initials={initialsOf(profile.firstName, profile.lastName, profile.email)}
            uploadAction={uploadMyAvatar}
            removeAction={removeMyAvatar}
          />
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-lg font-semibold">{name || profile.email}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t(locale, 'emp.profile.signedInAs')}</p>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <DataRow label={t(locale, 'emp.profile.role')} value={t(locale, `role.${profile.role}`)} />
            <DataRow label={t(locale, 'emp.profile.employeeNumber')} value={profile.employeeNumber ?? t(locale, 'common.none')} />
            <DataRow label={t(locale, 'emp.profile.weeklyHours')} value={profile.weeklyHours ?? t(locale, 'common.none')} />
            {profile.employmentStartDate && (
              <DataRow label={t(locale, 'emp.profile.employment')} value={formatDate(locale, profile.employmentStartDate)} />
            )}
          </dl>
        </Card>

        <Card>
          <CardHeader title={t(locale, 'emp.profile.contact')} />
          <EmployeeContactForm
            locale={locale}
            firstName={profile.firstName}
            lastName={profile.lastName}
            phone={profile.phone}
            email={profile.email}
            action={updateMyContactDetails}
          />
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold tracking-tight">{t(locale, 'emp.profile.language')}</h2>
          <EmployeeLanguagePicker locale={locale} action={setMyAppLanguage} />
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold tracking-tight">Konto und Sicherheit</h2>
          <p className="mt-1 text-sm text-muted-foreground">Passwort ändern oder einen Reset-Link per E-Mail anfordern.</p>
          <div className="mt-4">
            <AccountPasswordForm />
          </div>
        </Card>

        <div className="pt-1">
          <EmployeeLogoutButton locale={locale} action={logout} />
        </div>
      </div>
    </>
  );
}
