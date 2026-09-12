export type FormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  id?: string;
  invitationUrl?: string;
  conflictWarning?: string;
};

export const initialFormState: FormState = { status: 'idle' };
