export type ItemType = 'task' | 'deadline' | 'decision' | 'idea' | 'name' | 'other';

export interface StructuredItem {
  id: number;
  note_id: number;
  type: ItemType;
  content: string;
  due_date: string | null;
  created_at: string;
}

export interface Note {
  id: number;
  created_at: string;
  raw_transcript: string;
  audio_filename: string | null;
  title: string | null;
  summary: string | null;
  structured_items: StructuredItem[];
}

export interface DiscardedNote {
  status: 'discarded';
  message: string;
}

export type UploadResponse = Note | DiscardedNote;

export function isDiscarded(response: UploadResponse): response is DiscardedNote {
  return 'status' in response && response.status === 'discarded';
}

export interface ChatSource {
  id: number;
  timestamp: string;
  title: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: ChatSource[];
}

export interface TaskItem {
  id: number;
  note_id: number;
  content: string;
  due_date: string | null;
  created_at: string;
}
