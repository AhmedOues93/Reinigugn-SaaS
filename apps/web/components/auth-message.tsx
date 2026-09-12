export function AuthMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return <p className={error ? 'rounded-md bg-red-50 p-3 text-sm text-red-700' : 'rounded-md bg-teal-50 p-3 text-sm text-teal-800'}>{error ?? message}</p>;
}
