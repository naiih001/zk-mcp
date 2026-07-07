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
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  rank: number;
  updated_at: string;
}
