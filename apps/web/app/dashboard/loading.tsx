import { Skeleton } from '@/components/ui';

/** Skeleton matching the page-header + card rhythm every dashboard list uses. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-card p-5">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
