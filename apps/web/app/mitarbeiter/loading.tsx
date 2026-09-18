/** Skeleton that matches the card rhythm of the employee screens. */
export default function EmployeeLoading() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-busy="true">
      <div className="h-6 w-2/3 rounded bg-slate-200" />
      <div className="h-4 w-1/3 rounded bg-slate-200" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-3 rounded-lg border bg-white p-4">
          <div className="h-5 w-3/4 rounded bg-slate-200" />
          <div className="h-4 w-1/2 rounded bg-slate-100" />
          <div className="h-4 w-1/3 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
