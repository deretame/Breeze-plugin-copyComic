export type BasePayload = {
  extern?: Record<string, unknown>;
};

export type SearchPayload = BasePayload & {
  keyword?: string;
  page?: number;
};

export type RecommendPayload = BasePayload & {
  page?: number;
};

export type NewestPayload = BasePayload & {
  page?: number;
};

export type RankPayload = BasePayload & {
  page?: number;
  audienceType?: "male" | "female";
  dateType?: "day" | "week" | "month" | "total";
  rankType?: 1 | 5;
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

export type RecommendApiData = {
  list?: Array<{ type?: number; comic?: SearchApiComic }>;
  total?: number;
  limit?: number;
  offset?: number;
};

export type NewestApiData = {
  list?: Array<{ name?: string; datetime_created?: string; comic?: SearchApiComic }>;
  total?: number;
  limit?: number;
  offset?: number;
};

export type RankApiBook = {
  name?: string;
  path_word?: string;
  cover?: string;
  author?: Array<{ name?: string }>;
  popular?: number;
  theme?: Array<{ name?: string }>;
};

export type RankApiData = {
  list?: Array<{
    sort?: number;
    sort_last?: number;
    rise_sort?: number;
    rise_num?: number;
    date_type?: number;
    popular?: number;
    comic?: SearchApiComic;
    book?: RankApiBook;
  }>;
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
  uuid?: string;
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
  groupTitle: string | null;
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

export type CollectApiItem = {
  uuid?: number;
  folder_id?: number | null;
  comic?: SearchApiComic & { uuid?: string };
};

export type CollectApiData = {
  list?: CollectApiItem[];
  total?: number;
  limit?: number;
  offset?: number;
};
export type ComicCommentItem = {
  id?: number | string;
  create_at?: string;
  user_id?: string;
  user_name?: string;
  user_avatar?: string;
  comment?: string;
  count?: number;
  parent_id?: number | string | null;
  parent_user_id?: string | null;
  parent_user_name?: string | null;
};

export type ComicCommentData = {
  list?: ComicCommentItem[];
  total?: number;
  limit?: number;
  offset?: number;
};

export type MemberInfoResult = {
  user_id?: string;
  username?: string;
  nickname?: string;
  avatar?: string;
};

export type ComicQueryResult = {
  collect?: number | null;
  is_login?: boolean;
};

export type CloudFavoritePayload = BasePayload & {
  page?: number;
  ordering?: string;
};
