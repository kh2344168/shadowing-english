export type StudentKnowledgeKind = 'word' | 'chunk' | 'sentence';

export interface StudentKnowledgeSource {
  lessonId: string;
  lessonTitle: string;
  weekName: string;
  curriculumSlotId: string;
}

export interface StudentKnowledgeItem {
  key: string;
  kind: StudentKnowledgeKind;
  text: string;
  translation?: string;
  explanation?: string;
  example?: string;
  extraExample?: string;
  usageNote?: string;
  appearances: number;
  sources: StudentKnowledgeSource[];
}

export interface StudentKnowledgeBank {
  words: StudentKnowledgeItem[];
  chunks: StudentKnowledgeItem[];
  sentences: StudentKnowledgeItem[];
  all: StudentKnowledgeItem[];
  studiedLessonCount: number;
  generatedAt: string;
}

export interface StudentAiKnowledgeSnapshot {
  knownWords: string[];
  knownChunks: string[];
  practicedSentences: string[];
  studiedLessonCount: number;
  note: string;
}
