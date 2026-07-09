export type SupportedLanguage = "en" | "ja" | "es" | "fr";
export type NativeLanguage = "zh" | "en";
export type StorageMode = "local" | "remote";
export type StorageProvider = "local" | "gdrive" | "baidu" | "quark" | "custom";
export type ParseStatus = "pending" | "processing" | "ready" | "error";
export type CardType = "vocabulary" | "pattern" | "listening" | "drill" | "writing";
export type DrillType = "substitution" | "transformation";
export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface StorageConfig {
  mode: StorageMode;
  provider: StorageProvider;
  path?: string;
  fileId?: string;
  url?: string;
}

export interface MaterialIndexEntry {
  id: string;
  title: string;
  sourceLang: SupportedLanguage;
  nativeLang: NativeLanguage;
  level: string;
  topics: string[];
  storageLocation: StorageProvider;
  parseStatus: ParseStatus;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
}

export interface MaterialIndex {
  version: number;
  materials: MaterialIndexEntry[];
}

export interface TranscriptLine {
  id: string;
  start: number;
  end: number;
  text: string;
  translation: string;
  words?: string[];
}

export interface Transcript {
  materialId: string;
  lines: TranscriptLine[];
}

export interface Segment {
  start: number;
  end: number;
  reason: string;
  durationMinutes?: number;
}

export interface Segments {
  extensive: Segment[];
  intensive: Segment[];
}

export interface VocabularyItem {
  id: string;
  word: string;
  reading?: string;
  zh: string;
  partOfSpeech?: string;
  sentenceIds: string[];
  level?: string;
}

export interface PatternItem {
  id: string;
  pattern: string;
  zh: string;
  grammar: string;
  examples?: string[];
}

export interface MaterialManifest {
  id: string;
  title: string;
  sourceLang: SupportedLanguage;
  nativeLang: NativeLanguage;
  level: string;
  topics: string[];
  description?: string;
  sourceUrl?: string;
  storage: StorageConfig;
  segments: Segments;
  vocabulary: VocabularyItem[];
  patterns: PatternItem[];
  parseStatus: ParseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SubstitutionDrill {
  id: string;
  basePattern: string;
  baseZh: string;
  slots: { name: string; values: string[] }[];
  rounds: { prompt: string; expected: string }[];
}

export interface TransformationDrill {
  id: string;
  basePattern: string;
  baseZh: string;
  transformType: string;
  rounds: { prompt: string; expected: string }[];
}

export interface DrillsPack {
  materialId: string;
  substitution: SubstitutionDrill[];
  transformation: TransformationDrill[];
}

export interface ContentPack {
  manifest: MaterialManifest;
  transcript: Transcript;
  segments: Segments;
  drills?: DrillsPack;
  storage: StorageConfig;
}

export interface NotebookCard {
  id: string;
  type: CardType;
  front: string;
  back: string;
  materialId?: string;
  language: SupportedLanguage;
  tags: string[];
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
  lastReview?: string;
  lastRating?: ReviewRating;
  createdAt: string;
}

export interface WeakItem {
  id: string;
  text: string;
  translation: string;
  source: "listen" | "speak" | "read" | "write" | "drill";
  materialId?: string;
  errorCount: number;
  lastSeen: string;
}

export interface UserSettings {
  targetLang: SupportedLanguage;
  nativeLang: NativeLanguage;
  level: string;
  learningGoal: string;
  dailyReviewLimit: number;
  llmApiKey?: string;
  llmProvider?: "openai" | "anthropic" | "custom";
  githubRepo?: string;
  githubToken?: string;
}

export interface UserProfile {
  targetLang: SupportedLanguage;
  level: string;
  assessmentScore?: number;
  lastAssessment?: string;
  strengths: string[];
  weaknesses: string[];
}

export interface AssessmentQuestion {
  id: string;
  type: "vocabulary" | "listening" | "grammar" | "writing";
  language: SupportedLanguage;
  question: string;
  options?: string[];
  correctAnswer: string;
  audioSegment?: { materialId: string; start: number; end: number };
}

export interface AgentTask {
  id: string;
  type: "parse-listening" | "generate-drills";
  status: "pending" | "completed" | "failed";
  input: Record<string, unknown>;
  outputPath?: string;
  createdAt: string;
}

export interface MaterialMarks {
  lines: string[];
  vocabulary: string[];
  patterns: string[];
  updatedAt: string;
}

export type MarksStore = Record<string, MaterialMarks>;

export type CloudProviderType = "gdrive" | "baidu" | "quark" | "custom";
export type CloudAuthType = "oauth2" | "password" | "session";

export interface CloudProviderConfig {
  id: string;
  name: string;
  type: CloudProviderType;
  builtin?: boolean;
  authType?: CloudAuthType;
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  connected?: boolean;
  accessToken?: string;
}

export interface CloudSessionSecrets {
  bduss?: string;
  stoken?: string;
  accessToken?: string;
  cookies?: string;
}

export interface CloudSession {
  providerId: string;
  type: CloudProviderType;
  authType: CloudAuthType;
  username?: string;
  connected: boolean;
  expiresAt?: string;
  secrets?: CloudSessionSecrets;
}

export type MediaResolveType = "direct" | "embed" | "external";

export interface ResolvedMedia {
  type: MediaResolveType;
  url?: string;
  embedSrc?: string;
  sourceUrl?: string;
}
