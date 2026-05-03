export type BasePayload = {
  extern?: Record<string, unknown>;
};

export type SearchPayload = BasePayload & {
  keyword?: string;
  page?: number;
};

export type ComicDetailPayload = BasePayload & {
  comicId?: string;
};

export type ChapterPayload = BasePayload & {
  comicId?: string;
  chapterId?: string;
};

export type ReadSnapshotPayload = {
  comicId?: string;
  chapterId?: string;
  extern?: Record<string, unknown>;
};

export type FetchImagePayload = {
  url?: string;
  timeoutMs?: number;
  taskGroupKey?: string;
  extern?: Record<string, unknown>;
};

export type CopyApiResponse<T> = {
  code?: number;
  message?: string;
  results?: T;
};

export type SearchApiComic = {
  name?: string;
  path_word?: string;
  cover?: string;
  author?: Array<{ name?: string }>;
  popular?: number;
  datetime_updated?: string;
  last_chapter_name?: string;
  status?: { value?: string; display?: string };
  theme?: Array<{ name?: string }>;
};

export type SearchApiData = {
  list?: SearchApiComic[];
  total?: number;
  limit?: number;
  offset?: number;
};

export type DetailApiAuthor = {
  name?: string;
  path_word?: string;
};

export type DetailApiTheme = {
  name?: string;
  path_word?: string;
};

export type DetailApiStatus = {
  value?: string;
  display?: string;
};

export type DetailApiGroup = {
  name?: string;
  path_word?: string;
  count?: number;
};

export type DetailApiComic = {
  name?: string;
  path_word?: string;
  cover?: string;
  popular?: number;
  datetime_updated?: string;
  brief?: string;
  author?: DetailApiAuthor[];
  theme?: DetailApiTheme[];
  status?: DetailApiStatus;
  region?: { value?: number; display?: string };
  free_type?: { value?: number; display?: string };
  restrict?: { value?: number; display?: string };
  reclass?: { value?: number; display?: string };
  last_chapter?: { uuid?: string; name?: string };
  groups?: DetailApiGroup[] | Record<string, DetailApiGroup>;
};

export type DetailApiResult = {
  comic?: DetailApiComic;
  popular?: number;
  groups?: Record<string, DetailApiGroup> | DetailApiGroup[];
};

export type ChapterApiItem = {
  name?: string;
  uuid?: string;
  comic_path_word?: string;
  datetime_created?: string;
  size?: number;
  index?: number;
};

export type ChapterApiData = {
  list?: ChapterApiItem[];
  total?: number;
  limit?: number;
  offset?: number;
};

export type ChapterContentItem = {
  url?: string;
};

export type ChapterContentInfo = {
  uuid?: string;
  name?: string;
  contents?: ChapterContentItem[];
  words?: number[];
};

export type ChapterContentResult = {
  chapter?: ChapterContentInfo;
};

export type MappedEpItem = {
  id: string;
  name: string;
  order: number;
  extern: Record<string, unknown>;
};

export type CachedChapterContent = {
  name: string;
  contents: ChapterContentItem[];
  words: number[];
};

export type CachedGetChapterResult = {
  chapter: Record<string, unknown>;
};
