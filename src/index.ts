import ky from "ky";
import {
  NOT_FOUND_IMAGE_URL,
  SettingsBundleContract,
  createActionItem,
  createBasicMetadata,
  createImage,
  toStringMap,
} from "./common";
import {
  AUTH_TOKEN_CONFIG_KEY,
  CHAPTER_CACHE_TTL_MS,
  DEFAULT_API_BASE,
  DOWNLOAD_CANCELLED_MESSAGE,
  FETCH_IMAGE_MAX_CONCURRENT,
  FETCH_IMAGE_PRIORITY_REQUESTS_PER_MINUTE,
  FETCH_IMAGE_REQUESTS_PER_MINUTE,
  GET_CHAPTER_MAX_CONCURRENT,
  GET_CHAPTER_REQUESTS_PER_MINUTE,
  PLUGIN_ID,
  RATE_LIMIT_WAIT_CHUNK_MS,
  SEARCH_PAGE_SIZE,
} from "./config";
import { buildPluginInfo } from "./get-info";
import { createFetchImageDualLimiter, createRateLimiter } from "./limiter";
import { cache, pluginConfig, runtime } from "./tools";
import type {
  CachedChapterContent,
  CachedGetChapterResult,
  ChapterApiData,
  ChapterApiItem,
  ChapterContentInfo,
  ChapterContentItem,
  ChapterContentResult,
  ChapterPayload,
  ComicDetailPayload,
  CopyApiResponse,
  DetailApiComic,
  DetailApiGroup,
  DetailApiResult,
  FetchImagePayload,
  MappedEpItem,
  NewestApiData,
  NewestPayload,
  RankApiData,
  RankPayload,
  ReadSnapshotPayload,
  RecommendApiData,
  RecommendPayload,
  SearchApiComic,
  SearchApiData,
  SearchPayload,
} from "./types";

const API_DOMAIN_CONFIG_KEY = "api.domain";
const API_BASE_CACHE_KEY = "copyComic:apiBase:v1";
const PLATFORM_CONFIG_KEY = "api.platform";
const PLATFORM_CACHE_KEY = "copyComic:platform:v1";
const DEFAULT_API_DOMAIN_CHOICE = "热辣漫画线路2";
const DEFAULT_PLATFORM_VALUE = "1";
const HOME_PAGE_SIZE = 18;
const API_DOMAIN_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "国际服", value: "国际服" },
  { label: "国际服1", value: "国际服1" },
  { label: "大陆专线1", value: "大陆专线1" },
  { label: "大陆专线2", value: "大陆专线2" },
  { label: "大陆专线3", value: "大陆专线3" },
  { label: "大陆专线新站", value: "大陆专线新站" },
  { label: "热辣漫画线路1", value: "热辣漫画线路1" },
  { label: "热辣漫画线路2", value: "热辣漫画线路2" },
  { label: "热辣漫画线路3", value: "热辣漫画线路3" },
  { label: "热辣漫画线路4", value: "热辣漫画线路4" },
  { label: "热辣漫画线路5", value: "热辣漫画线路5" },
  { label: "热辣漫画线路6", value: "热辣漫画线路6" },
  { label: "热辣漫画线路7", value: "热辣漫画线路7" },
];
const PLATFORM_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "1（默认）", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "无", value: "" },
  { label: "空格", value: " " },
];
const RANK_AUDIENCE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "男频", value: "男频" },
  { label: "女频", value: "女频" },
];
const RANK_DATE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "日榜", value: "日榜" },
  { label: "周榜", value: "周榜" },
  { label: "月榜", value: "月榜" },
  { label: "总榜", value: "总榜" },
];
const RANK_TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "所有", value: "所有" },
  { label: "轻小说", value: "轻小说" },
];
const DISCOVER_THEME_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "全部", value: "" },
  { label: "爱情", value: "aiqing" },
  { label: "欢乐向", value: "huanlexiang" },
  { label: "冒险", value: "maoxian" },
  { label: "奇幻", value: "qihuan" },
  { label: "百合", value: "baihe" },
  { label: "校园", value: "xiaoyuan" },
  { label: "科幻", value: "kehuan" },
  { label: "东方", value: "dongfang" },
  { label: "耽美", value: "danmei" },
  { label: "生活", value: "shenghuo" },
  { label: "格斗", value: "gedou" },
  { label: "轻小说", value: "qingxiaoshuo" },
  { label: "其他", value: "qita" },
  { label: "悬疑", value: "xuanyi" },
  { label: "TL", value: "TL" },
  { label: "萌系", value: "mengxi" },
  { label: "神鬼", value: "shengui" },
  { label: "职场", value: "zhichang" },
  { label: "治愈", value: "zhiyu" },
  { label: "节操", value: "jiecao" },
  { label: "四格", value: "sige" },
  { label: "长条", value: "changtiao" },
  { label: "舰娘", value: "jianniang" },
  { label: "搞笑", value: "gaoxiao" },
  { label: "竞技", value: "jingji" },
  { label: "伪娘", value: "weiniang" },
  { label: "魔幻", value: "mohuan" },
  { label: "热血", value: "rexue" },
  { label: "性转换", value: "xingzhuanhuan" },
  { label: "美食", value: "meishi" },
  { label: "励志", value: "lizhi" },
  { label: "彩色", value: "caise" },
  { label: "后宫", value: "hougong" },
  { label: "侦探", value: "zhentan" },
  { label: "惊悚", value: "jingsong" },
  { label: "AA", value: "AA" },
  { label: "音乐舞蹈", value: "yinyuewudao" },
  { label: "异世界", value: "yishijie" },
  { label: "战争", value: "zhanzheng" },
  { label: "历史", value: "lishi" },
  { label: "机战", value: "jizhan" },
  { label: "都市", value: "dushi" },
  { label: "穿越", value: "chuanyue" },
  { label: "C102", value: "C102" },
  { label: "重生", value: "chongsheng" },
  { label: "恐怖", value: "kongbu" },
  { label: "C103", value: "C103" },
  { label: "生存", value: "shengcun" },
  { label: "C100", value: "C100" },
  { label: "C104", value: "C104" },
  { label: "C101", value: "C101" },
  { label: "C99", value: "C99" },
  { label: "C97", value: "C97" },
  { label: "武侠", value: "wuxia" },
  { label: "宅系", value: "zhaixi" },
  { label: "C96", value: "C96" },
  { label: "C105", value: "C105" },
  { label: "C98", value: "C98" },
  { label: "C95", value: "C95" },
  { label: "转生", value: "zhuansheng" },
  { label: "FATE", value: "FATE" },
  { label: "无修正", value: "wuxiuzheng" },
  { label: "仙侠", value: "xianxia" },
  { label: "LoveLive", value: "LoveLive" },
  { label: "杂志附赠写真集", value: "zazhifuzengxiezhenji" },
];
const DISCOVER_TOP_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "全部", value: "" },
  { label: "日本", value: "japan" },
  { label: "韩漫", value: "korea" },
  { label: "美漫", value: "west" },
  { label: "完结", value: "finish" },
];
const DISCOVER_ORDERING_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "最新", value: "-datetime_updated" },
  { label: "最旧", value: "datetime_updated" },
  { label: "热度最高", value: "-popular" },
  { label: "热度最低", value: "popular" },
];
const API_DOMAIN_BASE_MAP: Record<string, string> = {
  国际服: "https://api.mangacopy.com/api/v3",
  国际服1: "https://api.copy2000.online/api/v3",
  大陆专线1: "https://mapi.copy20.com/api/v3",
  大陆专线2: "https://mapi.copy2000.site/api/v3",
  大陆专线3: "https://api.2025copy.com/api/v3",
  大陆专线新站: "https://api.2026copy.com/api/v3",
  热辣漫画线路1: "https://mapi.hotmangasd.com/api/v3",
  热辣漫画线路2: "https://api.manga2025.com/api/v3",
  热辣漫画线路3: "https://mapi.hotmangasf.com/api/v3",
  热辣漫画线路4: "https://mapi.hotmangasg.com/api/v3",
  热辣漫画线路5: "https://mapi.elfgjfghkk.club/api/v3",
  热辣漫画线路6: "https://mapi.fgjfghkk.club/api/v3",
  热辣漫画线路7: "https://mapi.fgjfghkkcenter.club/api/v3",
};

function isValidApiBase(value: unknown): value is string {
  const text = String(value ?? "").trim();
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return /^https?:$/.test(parsed.protocol) && parsed.pathname.startsWith("/api/v3");
  } catch {
    return false;
  }
}

function apiBaseFromChoice(choice: string) {
  return API_DOMAIN_BASE_MAP[choice] || DEFAULT_API_BASE;
}

function unwrapStoredValue(raw: unknown) {
  const map = toStringMap(raw);
  if ("value" in map) {
    return map.value;
  }
  if (typeof raw !== "string") {
    return raw;
  }
  const text = raw.trim();
  if (!text) return "";
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(text);
      const parsedMap = toStringMap(parsed);
      if ("value" in parsedMap) {
        return parsedMap.value;
      }
      return parsed;
    } catch {
      return raw;
    }
  }
  return raw;
}

async function saveApiDomainChoice(choice: string) {
  const normalized = String(choice ?? "").trim();
  if (!API_DOMAIN_BASE_MAP[normalized]) {
    console.log(`[settings] saveApiDomainChoice ignored invalid choice="${normalized}"`);
    return;
  }
  const nextApiBase = apiBaseFromChoice(normalized);
  console.log(`[settings] saveApiDomainChoice choice="${normalized}" apiBase="${nextApiBase}"`);
  await Promise.allSettled([
    pluginConfig.save(API_DOMAIN_CONFIG_KEY, normalized),
    cache.set(API_DOMAIN_CONFIG_KEY, normalized),
    cache.set(API_BASE_CACHE_KEY, nextApiBase),
  ]);
}

async function savePlatformValue(platform: string) {
  const next = String(platform ?? "");
  await Promise.allSettled([
    pluginConfig.save(PLATFORM_CONFIG_KEY, next),
    cache.set(PLATFORM_CONFIG_KEY, next),
    cache.set(PLATFORM_CACHE_KEY, next),
  ]);
}

async function resolveApiBase() {
  const rawCached = await cache.get(API_BASE_CACHE_KEY, DEFAULT_API_BASE);
  const cachedValue = String(unwrapStoredValue(rawCached) ?? "").trim();
  if (isValidApiBase(cachedValue)) {
    console.log(`[api-base] hit cache apiBase="${cachedValue}"`);
    return cachedValue;
  }

  let choice = "";
  try {
    const rawChoiceFromCache = await cache.get(API_DOMAIN_CONFIG_KEY, DEFAULT_API_DOMAIN_CHOICE);
    choice = String(unwrapStoredValue(rawChoiceFromCache) ?? "").trim();
  } catch {
    // ignore cache read errors
  }
  if (!choice) {
    const rawChoice = await pluginConfig.load(API_DOMAIN_CONFIG_KEY, DEFAULT_API_DOMAIN_CHOICE);
    choice = String(unwrapStoredValue(rawChoice) ?? "").trim();
  }
  const resolvedChoice = API_DOMAIN_BASE_MAP[choice] ? choice : DEFAULT_API_DOMAIN_CHOICE;
  const resolvedApiBase = apiBaseFromChoice(resolvedChoice);
  console.log(
    `[api-base] rebuild from choice rawChoice="${choice}" resolvedChoice="${resolvedChoice}" apiBase="${resolvedApiBase}"`,
  );
  await Promise.allSettled([
    pluginConfig.save(API_DOMAIN_CONFIG_KEY, resolvedChoice),
    cache.set(API_DOMAIN_CONFIG_KEY, resolvedChoice),
    cache.set(API_BASE_CACHE_KEY, resolvedApiBase),
  ]);
  return resolvedApiBase;
}

async function resolvePlatformValue() {
  const rawCached = await cache.get(PLATFORM_CACHE_KEY, DEFAULT_PLATFORM_VALUE);
  const cachedValue = String(unwrapStoredValue(rawCached) ?? "");
  if (PLATFORM_OPTIONS.some((item) => item.value === cachedValue)) {
    return cachedValue;
  }

  let platform = "";
  try {
    const rawFromCache = await cache.get(PLATFORM_CONFIG_KEY, DEFAULT_PLATFORM_VALUE);
    platform = String(unwrapStoredValue(rawFromCache) ?? "");
  } catch {
    // ignore cache read errors
  }
  if (!PLATFORM_OPTIONS.some((item) => item.value === platform)) {
    const rawFromConfig = await pluginConfig.load(PLATFORM_CONFIG_KEY, DEFAULT_PLATFORM_VALUE);
    platform = String(unwrapStoredValue(rawFromConfig) ?? "");
  }
  const resolved = PLATFORM_OPTIONS.some((item) => item.value === platform)
    ? platform
    : DEFAULT_PLATFORM_VALUE;
  await savePlatformValue(resolved);
  return resolved;
}

function openSearchAction(keyword: string, extern: Record<string, unknown> = {}) {
  return {
    type: "openSearch",
    payload: {
      source: PLUGIN_ID,
      keyword,
      extern,
    },
  };
}

function buildExternSearchUrl(params: Record<string, string>) {
  const search = new URLSearchParams({
    limit: "21",
    offset: "0",
    ordering: "-datetime_updated",
    free_type: "1",
    platform: "3",
    ...params,
  });
  return `https://api.copy2000.online/api/v3/comics?${search.toString()}`;
}

async function getInfo() {
  return buildPluginInfo();
}

async function getApiHeaders() {
  const apiBase = await resolveApiBase();
  const platform = await resolvePlatformValue();
  const isHotMangaApi = isHotMangaApiBase(apiBase);
  const requestVersion = isHotMangaApi ? "2025.02.12" : "2025.05.09";

  const baseHeaders = {
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7",
    version: requestVersion,
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
  };

  if (isHotMangaApi) {
    const headers: Record<string, string> = {
      ...baseHeaders,
      Origin: "https://m.relamanhua.org",
      webp: "1",
    };
    if (platform.length > 0) {
      headers.platform = platform;
    }
    return headers;
  }

  const headers: Record<string, string> = {
    ...baseHeaders,
    Origin: "https://2025copy.com",
    region: "0",
    webp: "0",
  };
  if (platform.length > 0) {
    headers.platform = platform;
  }
  return headers;
}

function getApiHost(apiBase: string) {
  try {
    return new URL(apiBase).host.toLowerCase();
  } catch {
    return "";
  }
}

function isHotMangaApiBase(apiBase: string) {
  const apiHost = getApiHost(apiBase);
  return (
    apiHost.includes("hotmanga") || apiHost === "api.manga2025.com" || apiHost.includes("fgjfghkk")
  );
}

function createPagingInfo(page: number, pages: number, total: number) {
  return {
    page,
    pages: Math.max(1, pages),
    total,
    hasReachedMax: page >= Math.max(1, pages),
  };
}

function formatDateTime(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text;
  return new Date(parsed).toISOString().slice(0, 19).replace("T", " ");
}

function normalizeGroups(value: unknown): DetailApiGroup[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toStringMap(item) as DetailApiGroup)
      .filter((item) => Boolean(String(item.path_word ?? "").trim()));
  }
  const map = toStringMap(value);
  return Object.values(map)
    .map((item) => toStringMap(item) as DetailApiGroup)
    .filter((item) => Boolean(String(item.path_word ?? "").trim()));
}

async function fetchCopyApi<T>(url: string) {
  console.log(`[api] fetchCopyApi url="${url}"`);
  const json = (await ky
    .get(url, {
      headers: await getApiHeaders(),
    })
    .json()) as CopyApiResponse<T>;
  if (Number(json.code ?? 0) !== 200) {
    throw new Error(json.message || "请求失败");
  }
  return json;
}

async function fetchCopyApiWithHeaders<T>(url: string, headers: Record<string, string>) {
  const json = (await ky
    .get(url, {
      headers,
    })
    .json()) as CopyApiResponse<T>;
  if (Number(json.code ?? 0) !== 200) {
    throw new Error(json.message || "请求失败");
  }
  return json;
}

async function loadAuthToken() {
  try {
    return String(await pluginConfig.load(AUTH_TOKEN_CONFIG_KEY, "")).trim();
  } catch {
    return "";
  }
}

function sanitizeFileName(name: string) {
  const sanitized = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return sanitized || "image.jpg";
}

function extractImageName(imageUrl: string, index: number) {
  const fallback = `page-${String(index + 1).padStart(3, "0")}.jpg`;
  try {
    const parsed = new URL(imageUrl);
    const segment = parsed.pathname.split("/").filter(Boolean).pop();
    if (!segment) return fallback;
    return sanitizeFileName(decodeURIComponent(segment));
  } catch {
    return fallback;
  }
}

function sortChapterImageUrls(contents: ChapterContentItem[], words: unknown): string[] {
  const urls = contents.map((item) => String(item.url ?? "").trim());
  const orderList = Array.isArray(words) ? words.map((n) => Number(n)) : [];

  if (orderList.length !== urls.length) {
    return urls.filter(Boolean);
  }

  const mapped = urls
    .map((url, index) => ({
      url,
      index,
      order: orderList[index],
    }))
    .filter((item) => item.url && Number.isFinite(item.order));

  if (!mapped.length) {
    return urls.filter(Boolean);
  }

  mapped.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.index - b.index;
  });

  return mapped.map((item) => item.url);
}

function pickTargetChapter(
  eps: Array<{
    id: string;
    name: string;
    order: number;
    extern: Record<string, unknown>;
  }>,
  chapterIdInput: unknown,
  externInput: unknown,
) {
  const chapterIdText = String(chapterIdInput ?? "").trim();
  const extern = toStringMap(externInput);
  const externSort = Number(extern.sort ?? extern.order ?? extern.index ?? 0);
  const chapterIdAsNumber = Number(chapterIdText);

  const byId = eps.find((item) => item.id === chapterIdText);
  const byExternSort =
    Number.isFinite(externSort) && externSort > 0
      ? eps.find((item) => item.order === externSort)
      : undefined;
  const byNumericChapterId =
    Number.isFinite(chapterIdAsNumber) && chapterIdAsNumber > 0
      ? eps.find((item) => item.order === chapterIdAsNumber)
      : undefined;

  return byId ?? byExternSort ?? byNumericChapterId ?? eps[0];
}

async function isTaskGroupCancelled(taskGroupKey: string) {
  const key = String(taskGroupKey ?? "").trim();
  if (!key) return false;
  try {
    return Boolean(await runtime.isTaskGroupCancelled(key));
  } catch {
    return false;
  }
}

const limitGetChapter = createRateLimiter(
  "getChapter",
  GET_CHAPTER_REQUESTS_PER_MINUTE,
  GET_CHAPTER_MAX_CONCURRENT,
  {
    cache,
    toStringMap,
    isTaskGroupCancelled,
    rateLimitWaitChunkMs: RATE_LIMIT_WAIT_CHUNK_MS,
    downloadCancelledMessage: DOWNLOAD_CANCELLED_MESSAGE,
  },
);
const limitFetchImageDual = createFetchImageDualLimiter(
  FETCH_IMAGE_PRIORITY_REQUESTS_PER_MINUTE,
  FETCH_IMAGE_REQUESTS_PER_MINUTE,
  FETCH_IMAGE_MAX_CONCURRENT,
  {
    cache,
    toStringMap,
    isTaskGroupCancelled,
    rateLimitWaitChunkMs: RATE_LIMIT_WAIT_CHUNK_MS,
    downloadCancelledMessage: DOWNLOAD_CANCELLED_MESSAGE,
  },
);

function buildChapterCacheKey(comicId: string, groups: DetailApiGroup[]) {
  const groupKey = groups
    .map((group) => String(group.path_word ?? "").trim())
    .filter(Boolean)
    .sort()
    .join(",");
  return `copyComic:chapters:v1:${comicId}:${groupKey}`;
}

async function readChapterCache(cacheKey: string): Promise<MappedEpItem[] | null> {
  try {
    const raw = await cache.get(cacheKey, null);
    const data = toStringMap(raw);
    const ts = Number(data.ts ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (Date.now() - ts > CHAPTER_CACHE_TTL_MS) return null;
    const eps = Array.isArray(data.eps) ? data.eps : [];
    const mapped = eps
      .map((item) => toStringMap(item))
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        name: String(item.name ?? "").trim(),
        order: Number(item.order ?? 0) || 0,
        extern: toStringMap(item.extern),
      }))
      .filter((item) => item.id);
    return mapped;
  } catch {
    return null;
  }
}

async function writeChapterCache(cacheKey: string, eps: MappedEpItem[]) {
  try {
    await cache.set(cacheKey, {
      ts: Date.now(),
      eps,
    });
  } catch {
    // ignore cache write errors
  }
}

function buildChapterContentCacheKey(comicId: string, chapterId: string) {
  return `copyComic:chapterContent:v1:${comicId}:${chapterId}`;
}

async function readChapterContentCache(
  comicId: string,
  chapterId: string,
): Promise<CachedChapterContent | null> {
  try {
    const raw = await cache.get(buildChapterContentCacheKey(comicId, chapterId), null);
    const data = toStringMap(raw);
    const ts = Number(data.ts ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (Date.now() - ts > CHAPTER_CACHE_TTL_MS) return null;

    const chapter = toStringMap(data.chapter);
    const name = String(chapter.name ?? "").trim();
    const contents = (Array.isArray(chapter.contents) ? chapter.contents : [])
      .map((item) => toStringMap(item))
      .map((item) => ({ url: String(item.url ?? "").trim() }))
      .filter((item) => item.url);
    const words = Array.isArray(chapter.words)
      ? chapter.words.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];

    if (contents.length === 0) return null;
    return { name, contents, words };
  } catch {
    return null;
  }
}

async function writeChapterContentCache(
  comicId: string,
  chapterId: string,
  chapter: CachedChapterContent,
) {
  try {
    await cache.set(buildChapterContentCacheKey(comicId, chapterId), {
      ts: Date.now(),
      chapter,
    });
  } catch {
    // ignore cache write errors
  }
}

function buildGetChapterCacheKey(comicId: string, chapterId: string) {
  return `copyComic:getChapter:v1:${comicId}:${chapterId}`;
}

async function readGetChapterCache(
  comicId: string,
  chapterId: string,
): Promise<CachedGetChapterResult | null> {
  try {
    const raw = await cache.get(buildGetChapterCacheKey(comicId, chapterId), null);
    const data = toStringMap(raw);
    const ts = Number(data.ts ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (Date.now() - ts > CHAPTER_CACHE_TTL_MS) return null;
    const chapter = toStringMap(data.chapter);
    if (!chapter || !Array.isArray(chapter.docs) || chapter.docs.length === 0) {
      return null;
    }
    return { chapter };
  } catch {
    return null;
  }
}

async function writeGetChapterCache(
  comicId: string,
  chapterId: string,
  chapter: Record<string, unknown>,
) {
  try {
    await cache.set(buildGetChapterCacheKey(comicId, chapterId), {
      ts: Date.now(),
      chapter,
    });
  } catch {
    // ignore cache write errors
  }
}

async function getChapterContentWithCache(
  comicId: string,
  chapterId: string,
  headers: Record<string, string>,
) {
  const cached = await readChapterContentCache(comicId, chapterId);
  if (cached) return cached;

  const chapterParams = new URLSearchParams({
    platform: "1",
  });
  const apiBase = await resolveApiBase();
  const primaryChapterPath = isHotMangaApiBase(apiBase) ? "chapter" : "chapter2";
  const secondaryChapterPath = primaryChapterPath === "chapter" ? "chapter2" : "chapter";
  const buildChapterUrl = (chapterPath: string) =>
    `${apiBase}/comic/${encodeURIComponent(comicId)}/${chapterPath}/${encodeURIComponent(chapterId)}?${chapterParams.toString()}`;

  let chapterResp: CopyApiResponse<ChapterContentResult>;
  try {
    chapterResp = await fetchCopyApiWithHeaders<ChapterContentResult>(
      buildChapterUrl(primaryChapterPath),
      headers,
    );
  } catch (error) {
    const status = Number((error as { response?: { status?: unknown } })?.response?.status ?? 0);
    if (status !== 404) {
      throw error;
    }
    chapterResp = await fetchCopyApiWithHeaders<ChapterContentResult>(
      buildChapterUrl(secondaryChapterPath),
      headers,
    );
  }
  const chapterNode = toStringMap(chapterResp.results);
  const chapterInfo = toStringMap(chapterNode.chapter) as ChapterContentInfo;
  const contents = (
    Array.isArray(chapterInfo.contents) ? chapterInfo.contents : []
  ) as ChapterContentItem[];
  const words = Array.isArray(chapterInfo.words)
    ? chapterInfo.words.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [];
  const result: CachedChapterContent = {
    name: String(chapterInfo.name ?? "").trim(),
    contents,
    words,
  };
  if (result.contents.length > 0) {
    await writeChapterContentCache(comicId, chapterId, result);
  }
  return result;
}

async function fetchAllGroupChapters(comicId: string, groups: DetailApiGroup[]) {
  const apiBase = await resolveApiBase();
  const cacheKey = buildChapterCacheKey(comicId, groups);
  const cached = await readChapterCache(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  const list: MappedEpItem[] = [];

  let order = 1;
  for (const group of groups) {
    const groupPathWord = String(group.path_word ?? "").trim();
    if (!groupPathWord) continue;

    const params = new URLSearchParams({
      limit: "500",
      offset: "0",
    });
    const apiUrl = `${apiBase}/comic/${encodeURIComponent(comicId)}/group/${encodeURIComponent(groupPathWord)}/chapters?${params.toString()}`;
    const chapterResp = await fetchCopyApi<ChapterApiData>(apiUrl);
    const chapterData = toStringMap(chapterResp.results);
    const chapterList = (
      Array.isArray(chapterData.list) ? chapterData.list : []
    ) as ChapterApiItem[];

    const groupName = String(group.name ?? "").trim();
    for (const chapter of chapterList) {
      const chapterId = String(chapter.uuid ?? "").trim();
      if (!chapterId) continue;
      const chapterName = String(chapter.name ?? "").trim() || `第${order}话`;
      list.push({
        id: chapterId,
        name: groupName ? `${groupName} - ${chapterName}` : chapterName,
        order,
        extern: {
          sort: order,
          groupPathWord,
          groupName,
          comicId,
          chapterId,
          size: Number(chapter.size ?? 0) || 0,
          createdAt: String(chapter.datetime_created ?? "").trim(),
        },
      });
      order += 1;
    }
  }

  await writeChapterCache(cacheKey, list);
  return list;
}

function mapSearchComicToGrid(item: SearchApiComic) {
  const comicId = String(item.path_word ?? "").trim();
  if (!comicId) {
    return null;
  }

  const title = String(item.name ?? "").trim() || `漫画 ${comicId}`;
  const coverUrl = String(item.cover ?? "").trim();
  const authorNames = Array.isArray(item.author)
    ? item.author.map((row) => String(row?.name ?? "").trim()).filter(Boolean)
    : [];
  const statusText =
    String(item.status?.display ?? "").trim() || String(item.status?.value ?? "").trim();
  const themeNames = Array.isArray(item.theme)
    ? item.theme.map((row) => String(row?.name ?? "").trim()).filter(Boolean)
    : [];
  const subtitle = [authorNames.join(" / "), statusText, item.last_chapter_name]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  const path = `comic/${comicId}/cover.jpg`;
  const hotValue = Number(item.popular ?? 0);
  const hot = Number.isFinite(hotValue) ? hotValue : 0;

  return {
    source: PLUGIN_ID,
    id: comicId,
    title,
    subtitle,
    finished: /完结/.test(statusText),
    likesCount: hot,
    viewsCount: hot,
    updatedAt: String(item.datetime_updated ?? "").trim(),
    cover: {
      id: comicId,
      url: coverUrl || NOT_FOUND_IMAGE_URL,
      path,
      name: `${comicId}.jpg`,
      extern: { path },
    },
    metadata: [
      createBasicMetadata("author", "作者", authorNames),
      createBasicMetadata("categories", "分类", themeNames),
      createBasicMetadata("status", "状态", statusText ? [statusText] : []),
      createBasicMetadata("latest", "更新", item.last_chapter_name ? [item.last_chapter_name] : []),
      createBasicMetadata("works", "作品", []),
      createBasicMetadata("actors", "角色", []),
    ],
    raw: item,
    extern: {
      comicId,
      pathWord: comicId,
    },
  };
}

function mapRankBookToComic(book: { [key: string]: unknown }) {
  return {
    name: String(book.name ?? "").trim(),
    path_word: String(book.path_word ?? "").trim(),
    cover: String(book.cover ?? "").trim(),
    author: Array.isArray(book.author)
      ? book.author.map((row) => ({ name: String(toStringMap(row).name ?? "").trim() }))
      : [],
    popular: Number(book.popular ?? 0) || 0,
    theme: Array.isArray(book.theme)
      ? book.theme.map((row) => ({ name: String(toStringMap(row).name ?? "").trim() }))
      : [],
    status: { display: "", value: "" },
    datetime_updated: "",
    last_chapter_name: "",
  } as SearchApiComic;
}

async function getHomeRecommend(payload: RecommendPayload = {}) {
  const apiBase = await resolveApiBase();
  const page = Math.max(1, Number(payload.page ?? 1) || 1);
  const offset = (page - 1) * HOME_PAGE_SIZE;
  const params = new URLSearchParams({
    pos: "3200102",
    limit: String(HOME_PAGE_SIZE),
    offset: String(offset),
    platform: "3",
  });
  const apiUrl = `${apiBase}/recs?${params.toString()}`;
  const json = await fetchCopyApi<RecommendApiData>(apiUrl);
  const data = toStringMap(json.results);
  const list = Array.isArray(data.list) ? data.list : [];
  const items = list
    .map((row) => toStringMap(toStringMap(row).comic) as SearchApiComic)
    .map((item) => mapSearchComicToGrid(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const total = Number(data.total ?? items.length) || items.length;
  const limit = Number(data.limit ?? HOME_PAGE_SIZE) || HOME_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const paging = createPagingInfo(page, pageCount, total);

  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: { paging, items },
    paging,
    items,
  };
}

async function getHomeNewest(payload: NewestPayload = {}) {
  const apiBase = await resolveApiBase();
  const page = Math.max(1, Number(payload.page ?? 1) || 1);
  const offset = (page - 1) * HOME_PAGE_SIZE;
  const isHot = isHotMangaApiBase(apiBase);
  const newestParams = new URLSearchParams({
    limit: String(HOME_PAGE_SIZE),
    offset: String(offset),
    platform: "3",
  });
  const updateParams = new URLSearchParams({
    limit: String(HOME_PAGE_SIZE),
    offset: String(offset),
    ordering: "-datetime_updated",
    platform: "3",
  });
  const primaryUrl = isHot
    ? `${apiBase}/comics?${updateParams.toString()}`
    : `${apiBase}/update/newest?${newestParams.toString()}`;
  const fallbackUrl = isHot
    ? `${apiBase}/update/newest?${newestParams.toString()}`
    : `${apiBase}/comics?${updateParams.toString()}`;

  let json: CopyApiResponse<NewestApiData>;
  try {
    json = await fetchCopyApi<NewestApiData>(primaryUrl);
  } catch (error) {
    const status = Number((error as { response?: { status?: unknown } })?.response?.status ?? 0);
    if (status !== 404) {
      throw error;
    }
    json = await fetchCopyApi<NewestApiData>(fallbackUrl);
  }
  const data = toStringMap(json.results);
  const list = Array.isArray(data.list) ? data.list : [];
  const items = list
    .map((row) => toStringMap(toStringMap(row).comic) as SearchApiComic)
    .map((item) => mapSearchComicToGrid(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const total = Number(data.total ?? items.length) || items.length;
  const limit = Number(data.limit ?? HOME_PAGE_SIZE) || HOME_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const paging = createPagingInfo(page, pageCount, total);

  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: { paging, items },
    paging,
    items,
  };
}

async function getHomeRank(payload: RankPayload = {}) {
  const apiBase = await resolveApiBase();
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, Number(payload.page ?? 1) || 1);
  const offset = (page - 1) * HOME_PAGE_SIZE;
  const audienceMap: Record<string, "male" | "female"> = { 男频: "male", 女频: "female" };
  const dateMap: Record<string, "day" | "week" | "month" | "total"> = {
    日榜: "day",
    周榜: "week",
    月榜: "month",
    总榜: "total",
  };
  const typeMap: Record<string, "1" | "5"> = { 所有: "1", 轻小说: "5" };

  const audienceOption = String(extern.audience ?? "男频");
  const dateOption = String(extern.dateType ?? "日榜");
  const typeOption = String(extern.rankType ?? "所有");

  const audienceType =
    payload.audienceType === "female"
      ? "female"
      : payload.audienceType === "male"
        ? "male"
        : (audienceMap[audienceOption] ?? "male");
  const dateType = (
    ["day", "week", "month", "total"].includes(String(payload.dateType))
      ? String(payload.dateType)
      : (dateMap[dateOption] ?? "day")
  ) as "day" | "week" | "month" | "total";
  const rankType = (Number(payload.rankType) === 5 ? "5" : (typeMap[typeOption] ?? "1")) as
    | "1"
    | "5";
  const params = new URLSearchParams({
    type: rankType,
    date_type: dateType,
    limit: String(HOME_PAGE_SIZE),
    offset: String(offset),
    audience_type: audienceType,
    platform: "3",
  });
  const apiUrl = `${apiBase}/ranks?${params.toString()}`;
  const json = await fetchCopyApi<RankApiData>(apiUrl);
  const data = toStringMap(json.results);
  const list = Array.isArray(data.list) ? data.list : [];
  const items = list
    .map((row) => {
      const map = toStringMap(row);
      const comic = toStringMap(map.comic);
      if (String(comic.path_word ?? "").trim()) {
        return comic as SearchApiComic;
      }
      const book = toStringMap(map.book);
      if (String(book.path_word ?? "").trim()) {
        return mapRankBookToComic(book);
      }
      return null;
    })
    .filter((item): item is SearchApiComic => item !== null)
    .map((item) => mapSearchComicToGrid(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const total = Number(data.total ?? items.length) || items.length;
  const limit = Number(data.limit ?? HOME_PAGE_SIZE) || HOME_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const paging = createPagingInfo(page, pageCount, total);

  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: { paging, items },
    paging,
    items,
  };
}

async function getHomeRankFilterBundle(payload: { extern?: Record<string, unknown> } = {}) {
  const extern = toStringMap(payload.extern);
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "rankingFilter",
      title: "筛选排行榜（高级选项）",
      fields: [
        {
          key: "audience",
          kind: "choice",
          label: "受众",
          options: RANK_AUDIENCE_OPTIONS.map((item) => ({
            label: item.label,
            value: item.value,
            result: { extern: { audience: item.value } },
          })),
        },
        {
          key: "dateType",
          kind: "choice",
          label: "周期",
          options: RANK_DATE_OPTIONS.map((item) => ({
            label: item.label,
            value: item.value,
            result: { extern: { dateType: item.value } },
          })),
        },
        {
          key: "rankType",
          kind: "choice",
          label: "类型",
          options: RANK_TYPE_OPTIONS.map((item) => ({
            label: item.label,
            value: item.value,
            result: { extern: { rankType: item.value } },
          })),
        },
      ],
    },
    data: {
      values: {
        audience: String(extern.audience ?? "男频"),
        dateType: String(extern.dateType ?? "日榜"),
        rankType: String(extern.rankType ?? "所有"),
      },
    },
  };
}

async function getHomeDiscover(payload: RecommendPayload = {}) {
  const apiBase = await resolveApiBase();
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, Number(payload.page ?? 1) || 1);
  const offset = (page - 1) * HOME_PAGE_SIZE;
  const theme = String(extern.theme ?? "").trim();
  const top = String(extern.top ?? "").trim();
  const ordering = String(extern.ordering ?? "-datetime_updated").trim() || "-datetime_updated";
  const params = new URLSearchParams({
    limit: String(HOME_PAGE_SIZE),
    offset: String(offset),
    free_type: "1",
    ordering,
    theme,
    top,
    platform: "3",
  });
  const apiUrl = `${apiBase}/comics?${params.toString()}`;
  const json = await fetchCopyApi<SearchApiData>(apiUrl);
  const data = toStringMap(json.results);
  const list = (Array.isArray(data.list) ? data.list : []) as SearchApiComic[];
  const items = list
    .map((item) => mapSearchComicToGrid(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const total = Number(data.total ?? items.length) || items.length;
  const limit = Number(data.limit ?? HOME_PAGE_SIZE) || HOME_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const paging = createPagingInfo(page, pageCount, total);

  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: { paging, items },
    paging,
    items,
  };
}

async function getHomeDiscoverFilterBundle(payload: { extern?: Record<string, unknown> } = {}) {
  const extern = toStringMap(payload.extern);
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "comicListFilter",
      title: "发现（高级选项）",
      fields: [
        {
          key: "theme",
          kind: "choice",
          label: "分类",
          options: DISCOVER_THEME_OPTIONS.map((item) => ({
            label: item.label,
            value: item.value,
            result: { extern: { theme: item.value } },
          })),
        },
        {
          key: "top",
          kind: "choice",
          label: "分区",
          options: DISCOVER_TOP_OPTIONS.map((item) => ({
            label: item.label,
            value: item.value,
            result: { extern: { top: item.value } },
          })),
        },
        {
          key: "ordering",
          kind: "choice",
          label: "排序",
          options: DISCOVER_ORDERING_OPTIONS.map((item) => ({
            label: item.label,
            value: item.value,
            result: { extern: { ordering: item.value } },
          })),
        },
      ],
    },
    data: {
      values: {
        theme: String(extern.theme ?? ""),
        top: String(extern.top ?? ""),
        ordering: String(extern.ordering ?? "-datetime_updated"),
      },
    },
  };
}

async function getCapabilities() {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "capabilities",
      actions: [
        { key: "home.recommend", title: "漫画推荐", fnPath: "getHomeRecommend" },
        { key: "home.newest", title: "全新上架", fnPath: "getHomeNewest" },
        { key: "home.discover", title: "发现", fnPath: "getHomeDiscover" },
        { key: "home.rank", title: "排行榜", fnPath: "getHomeRank" },
      ],
    },
    data: {},
  };
}

async function searchComic(payload: SearchPayload = {}) {
  const apiBase = await resolveApiBase();
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, Number(payload.page ?? 1) || 1);
  const keyword = String(payload.keyword ?? extern.keyword ?? "").trim();
  const externSearchType = String(extern.searchType ?? "").trim();
  const externPathWord = String(extern.pathWord ?? "").trim();
  const externApiUrl = String(extern.apiUrl ?? extern.searchUrl ?? extern.url ?? "").trim();

  if (!keyword && !externApiUrl) {
    throw new Error("keyword 不能为空");
  }

  const apiUrl = externApiUrl
    ? (() => {
        const parsed = new URL(externApiUrl);
        if (externPathWord && externSearchType === "theme") {
          parsed.searchParams.set("theme", externPathWord);
        }
        if (externPathWord && externSearchType === "author") {
          parsed.searchParams.set("author", externPathWord);
        }
        const limitFromUrl = Number(parsed.searchParams.get("limit") ?? 0);
        const resolvedLimit =
          Number.isFinite(limitFromUrl) && limitFromUrl > 0 ? limitFromUrl : SEARCH_PAGE_SIZE;
        parsed.searchParams.set("limit", String(resolvedLimit));
        parsed.searchParams.set("offset", String((page - 1) * resolvedLimit));
        return parsed.toString();
      })()
    : (() => {
        const offset = (page - 1) * SEARCH_PAGE_SIZE;
        const params = new URLSearchParams({
          limit: String(SEARCH_PAGE_SIZE),
          offset: String(offset),
          q: keyword,
          q_type: "",
          platform: "1",
        });
        return `${apiBase}/search/comic?${params.toString()}`;
      })();
  const json = await fetchCopyApi<SearchApiData>(apiUrl);

  console.log(`[api] searchComic json=${JSON.stringify(json)}`);

  if (Number(json.code ?? 0) !== 200) {
    throw new Error(json.message || "搜索失败");
  }

  const data = toStringMap(json.results);
  const list = (Array.isArray(data.list) ? data.list : []) as SearchApiComic[];
  const items = list
    .map((item) => mapSearchComicToGrid(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const totalValue = Number(data.total ?? items.length);
  const total = Number.isFinite(totalValue) ? totalValue : items.length;
  const limitValue = Number(data.limit ?? SEARCH_PAGE_SIZE);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : SEARCH_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const paging = createPagingInfo(page, pageCount, total);

  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    scheme: {
      version: "1.0.0",
      type: "searchResult",
      source: PLUGIN_ID,
      list: "comicGrid",
    },
    data: {
      paging,
      items,
    },
    paging,
    items,
  };
}

async function getComicDetail(payload: ComicDetailPayload = {}) {
  const apiBase = await resolveApiBase();
  const comicId = String(payload.comicId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }
  const params = new URLSearchParams({
    platform: "1",
  });
  const detailUrl = `${apiBase}/comic2/${encodeURIComponent(comicId)}?${params.toString()}`;
  const detailResp = await fetchCopyApi<DetailApiResult>(detailUrl);
  const result = toStringMap(detailResp.results) as DetailApiResult;
  const detail = toStringMap(result.comic) as DetailApiComic;

  const authorEntries = Array.isArray(detail.author)
    ? detail.author
        .map((item) => ({
          name: String(item?.name ?? "").trim(),
          pathWord: String(item?.path_word ?? "").trim(),
        }))
        .filter((item) => item.name)
    : [];
  const themeEntries = Array.isArray(detail.theme)
    ? detail.theme
        .map((item) => ({
          name: String(item?.name ?? "").trim(),
          pathWord: String(item?.path_word ?? "").trim(),
        }))
        .filter((item) => item.name)
    : [];
  const authorActions = authorEntries.map((author) =>
    createActionItem(
      author.name,
      openSearchAction(author.name, {
        apiUrl: buildExternSearchUrl({
          author: author.pathWord || author.name,
        }),
        searchType: "author",
        keyword: author.name,
        pathWord: author.pathWord || author.name,
      }),
    ),
  );
  const themeActions = themeEntries.map((theme) =>
    createActionItem(
      theme.name,
      openSearchAction(theme.name, {
        apiUrl: buildExternSearchUrl({
          theme: theme.pathWord || theme.name,
        }),
        searchType: "theme",
        keyword: theme.name,
        pathWord: theme.pathWord || theme.name,
      }),
    ),
  );
  const statusText =
    String(detail.status?.display ?? "").trim() || String(detail.status?.value ?? "").trim();
  const groups = normalizeGroups(result.groups ?? detail.groups);

  const eps = await fetchAllGroupChapters(comicId, groups);
  const updateText = formatDateTime(detail.datetime_updated);
  const title = String(detail.name ?? "").trim() || comicId;
  const coverUrl = String(detail.cover ?? "").trim();
  const popular = Number(result.popular ?? detail.popular ?? 0) || 0;
  const regionText = String(detail.region?.display ?? "").trim();
  const reclassText = String(detail.reclass?.display ?? "").trim();
  const lastChapterName = String(detail.last_chapter?.name ?? "").trim();

  const normal = {
    comicInfo: {
      id: comicId,
      title,
      titleMeta: [
        createActionItem(`状态：${statusText || "未知"}`),
        createActionItem(`类型：${reclassText || "未知"}`),
        createActionItem(`分区：${regionText || "未知"}`),
        createActionItem(`更新时间：${updateText || "未知"}`),
        createActionItem(`最新：${lastChapterName || "未知"}`),
        createActionItem(`章节数：${eps.length}`),
        createActionItem(`热度：${popular}`),
      ],
      creator: {
        id: "",
        name: "",
        avatar: createImage({
          id: "",
          url: NOT_FOUND_IMAGE_URL,
          name: "",
          path: "",
          extern: {},
        }),
        onTap: {},
        extern: {},
      },
      description: String(detail.brief ?? ""),
      cover: createImage({
        id: comicId,
        url: coverUrl || NOT_FOUND_IMAGE_URL,
        name: `${comicId}.jpg`,
        path: `comic/${comicId}/cover.jpg`,
        extern: {},
      }),
      metadata: [
        {
          type: "author",
          name: "作者",
          value: authorActions,
        },
        {
          type: "tags",
          name: "标签",
          value: themeActions,
        },
      ].filter((meta) => {
        const value = toStringMap(meta).value;
        return Array.isArray(value) && value.length > 0;
      }),
      extern: {},
    },
    eps,
    recommend: [],
    totalViews: popular,
    totalLikes: popular,
    totalComments: 0,
    isFavourite: false,
    isLiked: false,
    allowComments: false,
    allowLike: false,
    allowCollected: false,
    allowDownload: true,
    extern: {},
  };

  const scheme = {
    version: "1.0.0",
    type: "comicDetail",
    source: PLUGIN_ID,
  };

  const data = {
    normal,
    raw: {
      comicInfo: detail,
      series: eps,
    },
  };

  return {
    source: PLUGIN_ID,
    comicId,
    extern: payload.extern ?? null,
    scheme,
    data,
  };
}

async function getReadSnapshot(payload: ReadSnapshotPayload = {}) {
  const comicId = String(payload.comicId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }
  const extern = toStringMap(payload.extern);
  const inputChapterId = String(payload.chapterId ?? extern.chapterId ?? "").trim();

  const detail = await getComicDetail({
    comicId,
    extern: payload.extern,
  });
  const normal = toStringMap(toStringMap(detail.data).normal);
  const comicInfo = toStringMap(normal.comicInfo);
  const eps = (Array.isArray(normal.eps) ? normal.eps : [])
    .map((item) => toStringMap(item))
    .map((item) => ({
      id: String(item.id ?? "").trim(),
      name: String(item.name ?? "").trim(),
      order: Number(item.order ?? 0) || 0,
      extern: toStringMap(item.extern),
    }))
    .filter((item) => item.id);
  if (eps.length === 0) {
    throw new Error("未找到可阅读章节");
  }
  const targetChapter = pickTargetChapter(eps, inputChapterId, extern);
  const chapterId = targetChapter.id;

  const headers: Record<string, string> = {
    ...(await getApiHeaders()),
  };
  const localToken = await loadAuthToken();
  if (localToken) {
    headers.authorization = `Token ${localToken}`;
  }
  const chapterContent = await getChapterContentWithCache(comicId, chapterId, headers);
  const imageUrls = sortChapterImageUrls(chapterContent.contents, chapterContent.words);
  const pages = imageUrls.map((imageUrl, index) => {
    const name = extractImageName(imageUrl, index);
    return {
      id: `${chapterId}-${index + 1}`,
      name,
      path: `comic/${comicId}/${chapterId}/${name}`,
      url: imageUrl,
      extern: {
        index: index + 1,
        comicId,
        chapterId,
        chapterOrder: targetChapter.order,
      },
    };
  });
  if (pages.length === 0) {
    throw new Error("当前章节没有可用图片");
  }

  const chapters = eps.map((item) => ({
    id: item.id,
    name: item.name || `章节 ${item.id}`,
    order: item.order,
    extern: {
      ...item.extern,
      comicId,
      chapterId: item.id,
      order: item.order,
    },
  }));

  return {
    source: PLUGIN_ID,
    extern: payload.extern ?? null,
    data: {
      comic: {
        id: String(comicInfo.id ?? comicId),
        source: PLUGIN_ID,
        title: String(comicInfo.title ?? ""),
        description: String(comicInfo.description ?? ""),
        cover: {
          ...toStringMap(comicInfo.cover),
          extern: toStringMap(toStringMap(comicInfo.cover).extern),
        },
        creator: {
          ...toStringMap(comicInfo.creator),
          avatar: {
            ...toStringMap(toStringMap(comicInfo.creator).avatar),
            extern: toStringMap(toStringMap(toStringMap(comicInfo.creator).avatar).extern),
          },
          extern: toStringMap(toStringMap(comicInfo.creator).extern),
        },
        titleMeta: Array.isArray(comicInfo.titleMeta) ? comicInfo.titleMeta : [],
        metadata: Array.isArray(comicInfo.metadata) ? comicInfo.metadata : [],
        extern: toStringMap(comicInfo.extern),
      },
      chapter: {
        id: chapterId,
        name: chapterContent.name || targetChapter.name || `章节 ${chapterId}`,
        order: targetChapter.order,
        pages,
        extern: targetChapter.extern,
      },
      chapters,
    },
  };
}

async function getChapter(payload: ChapterPayload = {}) {
  const extern = toStringMap(payload.extern);
  const comicId = String(payload.comicId ?? extern.comicId ?? "").trim();
  const inputChapterId = String(payload.chapterId ?? extern.chapterId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }

  const detail = await getComicDetail({
    comicId,
    extern: payload.extern,
  });
  const normal = toStringMap(toStringMap(detail.data).normal);
  const eps = (Array.isArray(normal.eps) ? normal.eps : [])
    .map((item) => toStringMap(item))
    .map((item) => ({
      id: String(item.id ?? "").trim(),
      name: String(item.name ?? "").trim(),
      order: Number(item.order ?? 0) || 0,
      extern: toStringMap(item.extern),
    }))
    .filter((item) => item.id);
  if (eps.length === 0) {
    throw new Error("未找到可下载章节");
  }
  const targetChapter = pickTargetChapter(eps, inputChapterId, extern);
  const chapterId = targetChapter.id;

  const cached = await readGetChapterCache(comicId, chapterId);
  if (cached) {
    return {
      source: PLUGIN_ID,
      comicId,
      chapterId,
      extern: payload.extern ?? null,
      scheme: {
        version: "1.0.0",
        type: "chapterContent",
        source: PLUGIN_ID,
      },
      data: {
        chapter: cached.chapter,
      },
      chapter: cached.chapter,
    };
  }

  return limitGetChapter(async () => {
    const recheckCached = await readGetChapterCache(comicId, chapterId);
    if (recheckCached) {
      return {
        source: PLUGIN_ID,
        comicId,
        chapterId,
        extern: payload.extern ?? null,
        scheme: {
          version: "1.0.0",
          type: "chapterContent",
          source: PLUGIN_ID,
        },
        data: {
          chapter: recheckCached.chapter,
        },
        chapter: recheckCached.chapter,
      };
    }

    const headers: Record<string, string> = {
      ...(await getApiHeaders()),
    };
    const localToken = await loadAuthToken();
    if (localToken) {
      headers.authorization = `Token ${localToken}`;
    }
    const chapterContent = await getChapterContentWithCache(comicId, chapterId, headers);
    const imageUrls = sortChapterImageUrls(chapterContent.contents, chapterContent.words);
    const docs = imageUrls.map((imageUrl, index) => {
      const name = extractImageName(imageUrl, index);
      const path = `comic/${comicId}/${chapterId}/${name}`;
      return {
        id: `${chapterId}-${index + 1}`,
        name,
        path,
        url: imageUrl,
        extern: {
          index: index + 1,
          comicId,
          chapterId,
          chapterOrder: targetChapter.order,
        },
      };
    });
    if (docs.length === 0) {
      throw new Error("当前章节没有可下载图片");
    }

    const chapter = {
      epId: chapterId,
      epName: chapterContent.name || targetChapter.name || `章节 ${chapterId}`,
      length: docs.length,
      epPages: String(docs.length),
      docs,
      series: eps.map((item) => ({
        id: item.id,
        name: item.name || `章节 ${item.id}`,
        order: item.order,
        extern: {
          ...item.extern,
          comicId,
          chapterId: item.id,
          order: item.order,
        },
      })),
    };

    await writeGetChapterCache(comicId, chapterId, chapter);

    return {
      source: PLUGIN_ID,
      comicId,
      chapterId,
      extern: payload.extern ?? null,
      scheme: {
        version: "1.0.0",
        type: "chapterContent",
        source: PLUGIN_ID,
      },
      data: {
        chapter,
      },
      chapter,
    };
  });
}

async function fetchImageBytes({
  url = "",
  timeoutMs = 30000,
  taskGroupKey = "",
  extern = {},
}: FetchImagePayload = {}) {
  const targetUrl = String(url).trim();
  if (!targetUrl) {
    throw new Error("url 不能为空");
  }

  const externMap = toStringMap(extern);
  const priority = Number(externMap.priority ?? 1);
  const resolvedTaskGroupKey = String(
    taskGroupKey || externMap.taskGroupKey || externMap.qjsTaskGroupKey || externMap.comicId || "",
  ).trim();
  if (resolvedTaskGroupKey && (await isTaskGroupCancelled(resolvedTaskGroupKey))) {
    throw new Error(DOWNLOAD_CANCELLED_MESSAGE);
  }

  const fetchBytes = async () => {
    const resolvedTimeout = Math.max(0, Number(timeoutMs) || 30000);
    const arrayBuffer = await ky
      .get(targetUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "x-rquickjs-host-offload-binary-v1": "1",
        },
        timeout: resolvedTimeout,
      })
      .arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.byteLength === 0) {
      throw new Error("图片数据为空");
    }
    return bytes;
  };

  const isJpg = (() => {
    try {
      return new URL(targetUrl).pathname.toLowerCase().endsWith(".jpg");
    } catch {
      return targetUrl.toLowerCase().split("?")[0].endsWith(".jpg");
    }
  })();
  if (isJpg) {
    return fetchBytes();
  }

  return limitFetchImageDual(fetchBytes, {
    priority,
    taskGroupKey: resolvedTaskGroupKey,
  });
}

async function getSettingsBundle(): Promise<SettingsBundleContract> {
  await resolveApiBase();
  const supportedChoices = new Set(API_DOMAIN_OPTIONS.map((item) => item.value));
  const supportedPlatforms = new Set(PLATFORM_OPTIONS.map((item) => item.value));
  let selectedApiDomainChoice = DEFAULT_API_DOMAIN_CHOICE;
  let selectedPlatformValue = DEFAULT_PLATFORM_VALUE;
  try {
    const raw = await pluginConfig.load(API_DOMAIN_CONFIG_KEY, DEFAULT_API_DOMAIN_CHOICE);
    const candidate = String(unwrapStoredValue(raw) ?? "").trim();
    if (supportedChoices.has(candidate)) {
      selectedApiDomainChoice = candidate;
    }
    console.log(
      `[settings] getSettingsBundle candidate="${candidate}" selected="${selectedApiDomainChoice}"`,
    );
  } catch {
    // ignore config read errors
  }
  try {
    const raw = await pluginConfig.load(PLATFORM_CONFIG_KEY, DEFAULT_PLATFORM_VALUE);
    const candidate = String(unwrapStoredValue(raw) ?? "");
    if (supportedPlatforms.has(candidate)) {
      selectedPlatformValue = candidate;
    }
  } catch {
    // ignore config read errors
  }

  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [
        {
          id: "network",
          title: "网络",
          fields: [
            {
              key: API_DOMAIN_CONFIG_KEY,
              kind: "select",
              label: "接口域名（不可用可尝试更换）",
              fnPath: "saveSettings",
              options: API_DOMAIN_OPTIONS,
            },
            {
              key: PLATFORM_CONFIG_KEY,
              kind: "select",
              label: "platform",
              fnPath: "saveSettings",
              options: PLATFORM_OPTIONS,
            },
          ],
        },
      ],
    },
    data: {
      canShowUserInfo: false,
      values: {
        [API_DOMAIN_CONFIG_KEY]: selectedApiDomainChoice,
        [PLATFORM_CONFIG_KEY]: selectedPlatformValue,
      },
    },
  };
}

async function saveSettings(payload: { values?: Record<string, unknown> } = {}) {
  const payloadMap = toStringMap(payload);
  const values = toStringMap(payloadMap.values);
  const directValue = String(payloadMap.value ?? payloadMap[API_DOMAIN_CONFIG_KEY] ?? "").trim();
  const selectedChoice = String(values[API_DOMAIN_CONFIG_KEY] ?? directValue).trim();
  console.log(
    `[settings] saveSettings payloadKeys=${Object.keys(payloadMap).join(",")} selectedChoice="${selectedChoice}"`,
  );
  if (selectedChoice) {
    await saveApiDomainChoice(selectedChoice);
  }
  if (PLATFORM_CONFIG_KEY in values || PLATFORM_CONFIG_KEY in payloadMap) {
    const directPlatform = String(
      payloadMap[PLATFORM_CONFIG_KEY] ?? payloadMap.platform ?? payloadMap.platformValue ?? "",
    );
    const selectedPlatform = String(values[PLATFORM_CONFIG_KEY] ?? directPlatform);
    await savePlatformValue(selectedPlatform);
  }
  return { ok: true };
}

export default {
  getInfo,
  getCapabilities,
  searchComic,
  getHomeRecommend,
  getHomeNewest,
  getHomeDiscover,
  getHomeDiscoverFilterBundle,
  getHomeRank,
  getHomeRankFilterBundle,
  getComicDetail,
  getChapter,
  getReadSnapshot,
  fetchImageBytes,
  getSettingsBundle,
  saveSettings,
};
