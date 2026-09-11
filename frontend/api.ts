import { File, UploadType } from 'expo-file-system';
import { API_BASE_URL } from './config';
import { Note, TaskItem, UploadResponse } from './types';

async function parseErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export async function fetchNotes(): Promise<Note[]> {
  const response = await fetch(`${API_BASE_URL}/notes`);
  if (!response.ok) {
    throw new Error(`Server error (${response.status})`);
  }
  return response.json();
}

export async function deleteNote(noteId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/notes/${noteId}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Server error (${response.status})${body ? `: ${body}` : ''}`);
  }
}

export async function deleteAllNotes(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/notes`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Server error (${response.status})${body ? `: ${body}` : ''}`);
  }
}

export async function uploadAudioNote(uri: string): Promise<UploadResponse> {
  const extension = uri.split('.').pop()?.toLowerCase();
  const mimeType = extension === 'wav' ? 'audio/wav' : 'audio/m4a';

  // expo-file-system's multipart upload is used instead of fetch()+FormData:
  // React Native's built-in FormData no longer accepts the classic
  // {uri, name, type} file object shape on recent versions.
  const file = new File(uri);
  const result = await file.upload(`${API_BASE_URL}/notes/upload`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Server error (${result.status})${result.body ? `: ${result.body}` : ''}`);
  }

  return JSON.parse(result.body);
}

export async function createManualNote(text: string): Promise<UploadResponse> {
  const response = await fetch(`${API_BASE_URL}/notes/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Server error (${response.status})${body ? `: ${body}` : ''}`);
  }
  return response.json();
}

export async function updateNote(
  noteId: number,
  payload: Partial<Pick<Note, 'title' | 'summary'>> & {
    structured_items?: { type: string; content: string; due_date: string | null }[];
  }
): Promise<Note> {
  const response = await fetch(`${API_BASE_URL}/notes/${noteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Server error (${response.status})${body ? `: ${body}` : ''}`);
  }
  return response.json();
}

export async function summarizeNote(noteId: number): Promise<Note> {
  const response = await fetch(`${API_BASE_URL}/notes/${noteId}/summarize`, { method: 'POST' });
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Server error (${response.status})${body ? `: ${body}` : ''}`);
  }
  return response.json();
}

export async function reclassifyNote(noteId: number): Promise<Note> {
  const response = await fetch(`${API_BASE_URL}/notes/${noteId}/reclassify`, { method: 'POST' });
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Server error (${response.status})${body ? `: ${body}` : ''}`);
  }
  return response.json();
}

export async function fetchTasks(): Promise<TaskItem[]> {
  const response = await fetch(`${API_BASE_URL}/tasks`);
  if (!response.ok) {
    throw new Error(`Server error (${response.status})`);
  }
  return response.json();
}

export async function askChat(question: string): Promise<{ answer: string; sources: { id: number; timestamp: string; title: string | null }[] }> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new Error(`Server error (${response.status})${body ? `: ${body}` : ''}`);
  }
  return response.json();
}
