/** Result returned by every server action used with <ActionForm>. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: unknown;
  /** Incremented on each submission so forms can react (reset, close dialogs). */
  nonce?: number;
};
export const initialActionState: ActionState = {};
