export type FormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  id?: string;
  invitationUrl?: string;
  conflictWarning?: string;
  /**
   * Where the client should navigate after a successful action. Only ever set
   * from a fixed internal path (see `landingPathForRole`), never from user input,
   * so it cannot be turned into an open redirect.
   */
  redirectTo?: string;
};

export const initialFormState: FormState = { status: 'idle' };
