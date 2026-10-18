'use client';

/**
 * Last-resort boundary: only fires if the root layout itself throws (a
 * segment-level error.tsx cannot catch that). It must render its own
 * <html>/<body> because it replaces the root layout entirely, so it cannot
 * depend on globals.css, i18n or any other app module that could itself be
 * the thing failing.
 */
export default function GlobalError({ reset: _reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '1.5rem',
        }}
      >
        <p style={{ fontWeight: 600, fontSize: '1.05rem' }}>Etwas ist schiefgelaufen</p>
        <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '24rem' }}>
          Die Anwendung konnte nicht geladen werden. Bitte versuchen Sie es erneut.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            minHeight: '2.75rem',
            padding: '0 1.5rem',
            borderRadius: '0.5rem',
            background: '#0f5c53',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: 'none',
          }}
        >
          Seite neu laden
        </button>
      </body>
    </html>
  );
}
