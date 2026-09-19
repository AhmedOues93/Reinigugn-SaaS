import { Badge } from '@/components/ui';

export function StatusBadge({ isActive }: { isActive: boolean }) {
  return <Badge tone={isActive ? 'primary' : 'neutral'}>{isActive ? 'Aktiv' : 'Archiviert'}</Badge>;
}
