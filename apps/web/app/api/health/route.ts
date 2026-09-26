import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Lightweight liveness endpoint for the hosting platform and external uptime
 * checks. It deliberately does not query Supabase: a health probe must never
 * expose tenant data or turn a temporary database incident into extra load.
 */
export async function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'reinplan' },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
