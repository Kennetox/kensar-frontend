import { getApiBase } from "@/lib/api/base";

export type UserProfileRecord = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  phone?: string | null;
  position?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  birth_date?: string | null;
  location?: string | null;
  bio?: string | null;
};

export type UserProfileUpdate = {
  name?: string;
  phone?: string | null;
  position?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  birth_date?: string | null;
  location?: string | null;
  bio?: string | null;
};

export type UserDocumentRecord = {
  id: number;
  user_id: number;
  file_name: string;
  file_url: string;
  file_size: number;
  note?: string | null;
  created_at: string;
};

export async function fetchUserProfile(token: string): Promise<UserProfileRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status}`);
  }
  return (await res.json()) as UserProfileRecord;
}

export async function updateUserProfile(
  token: string,
  payload: UserProfileUpdate
): Promise<UserProfileRecord> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/profile`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as UserProfileRecord;
}

export async function uploadUserAvatar(
  token: string,
  file: Blob,
  filename: string
): Promise<{ url: string }> {
  const apiBase = getApiBase();
  const formData = new FormData();
  formData.append("file", file, filename);
  const res = await fetch(`${apiBase}/pos/profile/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as { url: string };
}

export async function fetchUserDocuments(token: string): Promise<UserDocumentRecord[]> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/profile/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status}`);
  }
  return (await res.json()) as UserDocumentRecord[];
}

export async function uploadUserDocument(
  token: string,
  file: File,
  note?: string
): Promise<UserDocumentRecord> {
  const apiBase = getApiBase();
  const formData = new FormData();
  formData.append("file", file, file.name);
  if (note) {
    formData.append("note", note);
  }
  const res = await fetch(`${apiBase}/pos/profile/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
  return (await res.json()) as UserDocumentRecord;
}

export async function deleteUserDocument(token: string, docId: number): Promise<void> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/pos/profile/documents/${docId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Error ${res.status}`);
  }
}
