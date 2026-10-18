import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/components/job-form', () => ({ JobForm: vi.fn() }));
vi.mock('@/components/ui', () => ({ FormPage: vi.fn() }));
vi.mock('@/lib/data/customers', () => ({ listCustomerOptions: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/data/cleaning-objects', () => ({ listCleaningObjectOptions: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/data/jobs', () => ({ listAssignableEmployeeOptions: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/data/checklists', () => ({ listActiveChecklistTemplateOptions: vi.fn().mockResolvedValue([]) }));
vi.mock('@/app/dashboard/auftraege/actions', () => ({ createJob: vi.fn() }));
import NewJobPage from '@/app/dashboard/auftraege/neu/page';
import { listCustomerOptions } from '@/lib/data/customers';
import { listAssignableEmployeeOptions } from '@/lib/data/jobs';
afterEach(() => vi.clearAllMocks());
describe('new job prerequisites', () => {
  it('preserves the authentication redirect instead of showing an empty form', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/admin/login;307;' });
    vi.mocked(listCustomerOptions).mockRejectedValueOnce(redirect);
    await expect(NewJobPage()).rejects.toBe(redirect);
  });
  it('shows the retry boundary when employee options cannot be loaded', async () => {
    const unavailable = new Error('Mitarbeitende konnten nicht geladen werden.');
    vi.mocked(listAssignableEmployeeOptions).mockRejectedValueOnce(unavailable);
    await expect(NewJobPage()).rejects.toBe(unavailable);
  });
});
