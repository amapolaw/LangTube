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
  /** llm = Cursor/API 增强；rules = 无 Key 规则兜底 */
  enrichmentMode?: "llm" | "rules";
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
  /** 正面：原文 / 目标语 */
  front: string;
  /** 背面主释义（母语翻译） */
  back: string;
  /** 读音（如日语假名） */
  reading?: string;
  /** 词性 */
  partOfSpeech?: string;
  /** 用法 / 语法讲解 */
  explanation?: string;
  /** 例句 */
  examples?: string[];
  /** 释义来源（如 Jisho/JMDict、Free Dictionary） */
  dictSource?: string;
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
  cursorApiKey?: string;
  llmProvider?: "cursor" | "openai" | "anthropic" | "custom";
  githubRepo?: string;
  githubToken?: string;
  /** B站 Cookie（SESSDATA=...; bili_jct=...），在 Cursor IDE 登录 b 站后从浏览器复制 */
  bilibiliCookies?: string;
  /** yt-dlp 读取本机浏览器 Cookie：chrome / safari / edge（Cursor IDE 终端内有效） */
  ytdlpCookiesFromBrowser?: string;
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
  status: "pending" | "processing" | "completed" | "failed";
  input: Record<string, unknown>;
  outputPath?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
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
