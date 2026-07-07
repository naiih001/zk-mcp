export interface Note {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface NoteTag {
  note_id: string;
  tag_id: string;
}

export interface Link {
  source_note_id: string;
  target_note_id: string;
  created_at: string;
}

export interface NoteWithRelations extends Note {
  tags: string[];
  links: { id: string; title: string }[];
  backlinks: { id: string; title: string }[];
  todos: { id: string; title: string }[];
}

export interface Todo {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoNote {
  todo_id: string;
  note_id: string;
  created_at: string;
}

export interface TodoWithRelations extends Todo {
  notes: { id: string; title: string }[];
}

export interface TodoSearchResult {
  id: string;
  title: string;
  description: string;
  snippet: string;
  rank: number;
  status: string;
  priority: number;
  updated_at: string;
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  rank: number;
  updated_at: string;
}
