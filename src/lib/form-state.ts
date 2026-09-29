import type { FieldErrors } from "@/lib/validation";

/** Shape returned by every form Server Action and consumed with `useActionState`. */
export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: FieldErrors;
  /** Non-secret values to put back into the form after a failed submission. */
  values?: Record<string, string>;
};

export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
