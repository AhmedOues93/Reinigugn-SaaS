import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appDir = join(__dirname, '..', 'app');

function routeSegments(dir: string, prefix = ''): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === 'page.tsx') routes.push(prefix || '/');
      continue;
    }
    const isGroup = entry.startsWith('(') && entry.endsWith(')');
    routes.push(...routeSegments(full, isGroup ? prefix : `${prefix}/${entry}`));
  }
  return routes;
}

describe('routing surface', () => {
  const routes = routeSegments(appDir);

  it('exposes the public auth routes', () => {
    for (const route of ['/login', '/signup', '/forgot-password', '/reset-password', '/onboarding']) {
      expect(routes, `missing ${route}`).toContain(route);
    }
  });

  it('exposes the employee application as its own surface', () => {
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/mitarbeiter');
    for (const route of ['/mitarbeiter/einsaetze', '/mitarbeiter/nachrichten', '/mitarbeiter/abwesenheit', '/mitarbeiter/profil']) {
      expect(routes, `missing ${route}`).toContain(route);
    }
  });

  it('keeps a single employee surface instead of two parallel ones', () => {
    expect(routes.some((route) => route.includes('mein-bereich'))).toBe(false);
  });

  it('never ships duplicate route files such as "page 2.tsx"', () => {
    const suspicious: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\s\d+\.(tsx|ts)$/.test(entry)) suspicious.push(full);
      }
    };
    walk(appDir);
    expect(suspicious).toEqual([]);
  });
});
