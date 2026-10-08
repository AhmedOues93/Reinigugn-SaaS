import type { Instrumentation } from 'next';

/** Structured, privacy-minimal events for the hosting platform's log drain.
 * Never log the error message/stack or request: they can contain customer data,
 * cookies, invitation tokens, invoice IDs and uploaded document names.
 * routePath is the framework's route template, not the requested URL.
 */
export const onRequestError: Instrumentation.onRequestError = (error, _request, context) => {
  const digest = error && typeof error === 'object' && 'digest' in error
    && typeof error.digest === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(error.digest)
    ? error.digest : undefined;
  console.error(JSON.stringify({
    event: 'reinplan.request_error',
    timestamp: new Date().toISOString(),
    route: context.routePath,
    type: context.routeType,
    ...(digest ? { digest } : {}),
  }));
};
