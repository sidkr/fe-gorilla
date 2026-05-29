// Domain composable for Contacts. Thin wrapper over the contacts.* cloud
// functions via useCloud. Components never call Parse.Cloud.run directly.
import { useCloud } from "~/composables/app/useCloud";

export type ContactStatus =
  | "subscribed"
  | "unsubscribed"
  | "cleaned"
  | "pending";

export interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: ContactStatus;
  customFields: Record<string, unknown>;
  lists: string[];
  deleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ContactPage {
  rows: Contact[];
  total: number;
  page: number;
  perPage: number;
}

export interface ContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  status?: ContactStatus;
  customFields?: Record<string, unknown>;
}

export interface ContactPatch {
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: ContactStatus;
  customFields?: Record<string, unknown>;
  lists?: string[];
}

export function useContacts() {
  const { runCloud } = useCloud();

  function listContacts(params: {
    audienceId: string;
    page?: number;
    perPage?: number;
    search?: string;
  }) {
    return runCloud<ContactPage>("listContacts", params);
  }

  function addContact(audienceId: string, contact: ContactInput) {
    return runCloud<Contact>("addContact", { audienceId, ...contact });
  }

  function addContactsBulk(audienceId: string, contacts: ContactInput[]) {
    return runCloud<{ added: number; updated: number; skipped: number }>(
      "addContactsBulk",
      { audienceId, contacts },
    );
  }

  function updateContact(id: string, patch: ContactPatch) {
    return runCloud<Contact>("updateContact", { id, patch });
  }

  function deleteContact(id: string) {
    return runCloud<{ ok: boolean }>("deleteContact", { id });
  }

  function deleteContactData(email: string) {
    return runCloud<{ ok: boolean; removed: number }>("deleteContactData", {
      email,
    });
  }

  return {
    listContacts,
    addContact,
    addContactsBulk,
    updateContact,
    deleteContact,
    deleteContactData,
  };
}
