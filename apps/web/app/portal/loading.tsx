export default function PortalLoading() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-busy="true">
      <div className="h-7 w-2/3 rounded bg-slate-200" />
      <div className="h-4 w-1/2 rounded bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-24 rounded-lg border bg-white" />
        ))}
      </div>
      {[0, 1].map((index) => (
        <div key={index} className="h-20 rounded-lg border bg-white" />
      ))}
    </div>
  );
}
