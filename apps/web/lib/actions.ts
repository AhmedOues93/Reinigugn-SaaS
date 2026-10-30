export type FormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  id?: string;
  /**
   * Einladungslink fuer die Person, die gerade eingeladen hat, damit sie ihn
   * auch direkt (WhatsApp) weitergeben kann. Nur in dieser einen Antwort.
   */
  invitationUrl?: string;
  /** Ob die Einladungs-E-Mail rausging. */
  invitationDelivered?: boolean;
  /** Vorname fuer den Text beim Teilen. */
  invitationName?: string;
  conflictWarning?: string;
  /**
   * Where the client should navigate after a successful action. Only ever set
   * from a fixed internal path (see `landingPathForRole`), never from user input,
   * so it cannot be turned into an open redirect.
   */
  redirectTo?: string;
  /**
   * Eine begonnene Zwei-Faktor-Einrichtung. Das Geheimnis steht nur in dieser
   * einen Antwort an die Person, die es einrichtet, und wird nicht gespeichert.
   */
  mfaEnrolment?: { factorId: string; qrCode: string; secret: string };
};

export const initialFormState: FormState = { status: 'idle' };
