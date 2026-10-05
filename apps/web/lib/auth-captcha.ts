/** Tokens are verified by Supabase Auth, never trusted as authorization here. */
export function captchaOptions(formData: FormData): { captchaToken?: string } {
  const value = formData.get('captcha_token');
  const token = typeof value === 'string' ? value.trim() : '';
  return token && token.length <= 4096 ? { captchaToken: token } : {};
}

export function captchaRequired(formData: FormData): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) &&
    !captchaOptions(formData).captchaToken
  );
}

export const captchaMessage = 'Bitte bestätige die Sicherheitsprüfung und versuche es erneut.';
