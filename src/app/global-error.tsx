'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui', padding: '2rem', color: '#111' }}>
        <h2>Application error</h2>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: '1rem' }}>
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <button onClick={() => reset()} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Try again
        </button>
      </body>
    </html>
  )
}
