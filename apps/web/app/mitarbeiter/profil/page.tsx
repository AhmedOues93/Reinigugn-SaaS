import { notFound } from 'next/navigation';
import { Card, CardHeader, DataRow } from '@/components/ui';
import { EmployeePageHeader } from '@/components/employee/employee-shell';
import { AvatarForm } from '@/components/employee/avatar-form';
import { initialsOf } from '@/components/employee/avatar';
import { EmployeeLanguagePicker } from '@/components/employee/language-picker';
import { EmployeeLogoutButton } from '@/components/employee/logout-button';
import { EmployeeContactForm } from '@/components/employee/contact-form';
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

        <div className="pt-1">
          <EmployeeLogoutButton locale={locale} action={logout} />
        </div>
      </div>
    </>
  );
}
