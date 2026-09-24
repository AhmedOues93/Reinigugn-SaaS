'use client';

import { useEffect } from 'react';

export function PwaRegister({ worker, scope }: { worker: string; scope: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(worker, { scope }).catch(() => undefined);
  }, [scope, worker]);
  return null;
}
