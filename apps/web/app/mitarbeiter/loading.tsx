import { Skeleton } from '@/components/ui';

/** Skeleton that matches the card rhythm of the employee screens. */
export default function EmployeeLoading() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
