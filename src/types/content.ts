import type { ArticleDigest } from "./article";

export interface NewsletterContent {
  readonly subject: string;
  readonly previewText: string;
  readonly htmlBody: string;
  readonly plainTextBody: string;
  readonly digest: ArticleDigest;
  readonly generatedAt: Date;
}

export interface Tweet {
  readonly text: string;
  readonly mediaUrls: readonly string[];
}

export interface TwitterThread {
  readonly tweets: readonly Tweet[];
  readonly digest: ArticleDigest;
  readonly generatedAt: Date;
}

export interface YouTubeScript {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly sections: readonly ScriptSection[];
  readonly totalDurationEstimate: number;
  readonly digest: ArticleDigest;
  readonly generatedAt: Date;
}

export interface ScriptSection {
  readonly timestamp: string;
  readonly heading: string;
  readonly narration: string;
  readonly visualNotes: string;
  readonly durationSeconds: number;
}

export interface GeneratedContent {
  readonly newsletter: NewsletterContent;
  readonly twitter: TwitterThread;
  readonly youtube: YouTubeScript;
  readonly generatedAt: Date;
}
