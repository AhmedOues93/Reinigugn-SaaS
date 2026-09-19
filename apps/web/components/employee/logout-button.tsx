'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui';
import { clearOfflineData } from '@/lib/offline/store';
import { t, type Locale } from '@/lib/i18n';

/**
 * Signing out drops the device-local database and every cache this app owns
 * before the session is ended, so nothing of this cleaner's work survives on a
 * shared phone.
 */
export function EmployeeLogoutButton({ locale, action }: { locale: Locale; action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="block"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await clearOfflineData();
          await action();
        })
      }
    >
      <LogOut className="size-4 rtl:rotate-180" aria-hidden="true" />
      {t(locale, 'common.logout')}
    </Button>
  );
}
