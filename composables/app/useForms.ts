// Composable for signup-form CRUD. Thin wrapper over the forms.* cloud functions
// via useCloud (centralized error normalization + 209 session-expiry handling).
// Components never call Parse.Cloud.run directly. Mirrors useSegments shape.
import { useCloud } from "~/composables/app/useCloud";

export interface FormField {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "checkbox" | "select";
  required: boolean;
  options?: string[];
}

export interface SignupForm {
  id: string;
  name: string;
  fields: FormField[];
  targetListId: string;
  doubleOptIn: boolean;
  redirectUrl: string;
  submitButtonText: string;
  status: string;
  submissionCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export function useForms() {
  const { runCloud } = useCloud();

  function listForms() {
    return runCloud<{ rows: SignupForm[] }>("listForms");
  }

  function getForm(id: string) {
    return runCloud<SignupForm>("getForm", { id });
  }

  function createForm(input: Partial<SignupForm>) {
    return runCloud<SignupForm>("createForm", input as Record<string, unknown>);
  }

  function updateForm(id: string, patch: Partial<SignupForm>) {
    return runCloud<SignupForm>("updateForm", {
      id,
      patch: patch as Record<string, unknown>,
    });
  }

  function deleteForm(id: string) {
    return runCloud<{ ok: boolean }>("deleteForm", { id });
  }

  return { listForms, getForm, createForm, updateForm, deleteForm };
}
