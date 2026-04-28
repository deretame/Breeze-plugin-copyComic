import {
  NOT_FOUND_IMAGE_URL,
  PLUGIN_ID,
  createActionItem,
  createBasicMetadata,
  createImage,
  createMetadataActionList,
  toStringMap,
} from "./common";
import { buildPluginInfo } from "./get-info";
import { cache, pluginConfig, runtime } from "./tools";

type BasePayload = {
  extern?: Record<string, unknown>;
};

type SearchPayload = BasePayload & {
  keyword?: string;
  page?: number;
};

type ComicDetailPayload = BasePayload & {
  comicId?: string;
};

type ChapterPayload = BasePayload & {
  comicId?: string;
  chapterId?: string;
};

type ReadSnapshotPayload = {
  comicId?: string;
  chapterId?: string;
  extern?: Record<string, unknown>;
};

type FetchImagePayload = {
  url?: string;
  timeoutMs?: number;
};

type CopyApiResponse<T> = {
  code?: number;
  message?: string;
  results?: T;
};

type SearchApiComic = {
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

type SearchApiData = {
  list?: SearchApiComic[];
  total?: number;
  limit?: number;
  offset?: number;
};

type DetailApiAuthor = {
  name?: string;
  path_word?: string;
};

type DetailApiTheme = {
  name?: string;
  path_word?: string;
};

type DetailApiStatus = {
  value?: string;
  display?: string;
};

type DetailApiGroup = {
  name?: string;
  path_word?: string;
  count?: number;
};

type DetailApiComic = {
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

type DetailApiResult = {
  comic?: DetailApiComic;
  popular?: number;
  groups?: Record<string, DetailApiGroup> | DetailApiGroup[];
};

type ChapterApiItem = {
  name?: string;
  uuid?: string;
  comic_path_word?: string;
  datetime_created?: string;
  size?: number;
  index?: number;
};

type ChapterApiData = {
  list?: ChapterApiItem[];
  total?: number;
  limit?: number;
  offset?: number;
};

type ChapterContentItem = {
  url?: string;
};

type ChapterContentInfo = {
  uuid?: string;
  name?: string;
  contents?: ChapterContentItem[];
  words?: number[];
};

type ChapterContentResult = {
  chapter?: ChapterContentInfo;
};

const API_BASE = "https://api.2025copy.com/api/v3";
const SEARCH_PAGE_SIZE = 20;
const CHAPTER_CACHE_TTL_MS = 1000 * 60 * 10;
const AUTH_TOKEN_CONFIG_KEY = "auth.token";

function openSearchAction(keyword: string) {
  return {
    type: "openSearch",
    payload: {
      source: PLUGIN_ID,
      keyword,
      extern: {},
    },
  };
}

async function getInfo() {
  return buildPluginInfo();
}

function getApiHeaders() {
  return {
    "User-Agent": "COPY/3.0.0",
    Accept: "application/json",
    version: "2025.08.15",
    platform: "1",
    webp: "1",
    region: "1",
  };
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
  const response = await fetch(url, {
    method: "GET",
    headers: getApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`请求失败(${response.status})`);
  }
  const json = (await response.json()) as CopyApiResponse<T>;
  if (Number(json.code ?? 0) !== 200) {
    throw new Error(json.message || "请求失败");
  }
  return json;
}

async function fetchCopyApiWithHeaders<T>(
  url: string,
  headers: Record<string, string>,
) {
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`请求失败(${response.status})`);
  }
  const json = (await response.json()) as CopyApiResponse<T>;
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

function sortChapterImageUrls(
  contents: ChapterContentItem[],
  words: unknown,
): string[] {
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

type MappedEpItem = {
  id: string;
  name: string;
  order: number;
  extern: Record<string, unknown>;
};

type CachedChapterContent = {
  name: string;
  contents: ChapterContentItem[];
  words: number[];
};

function buildChapterCacheKey(comicId: string, groups: DetailApiGroup[]) {
  const groupKey = groups
    .map((group) => String(group.path_word ?? "").trim())
    .filter(Boolean)
    .sort()
    .join(",");
  return `copyComic:chapters:v1:${comicId}:${groupKey}`;
}

async function readChapterCache(
  cacheKey: string,
): Promise<MappedEpItem[] | null> {
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
    const raw = await cache.get(
      buildChapterContentCacheKey(comicId, chapterId),
      null,
    );
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
  const chapterUrl = `${API_BASE}/comic/${encodeURIComponent(comicId)}/chapter2/${encodeURIComponent(chapterId)}?${chapterParams.toString()}`;
  const chapterResp = await fetchCopyApiWithHeaders<ChapterContentResult>(
    chapterUrl,
    headers,
  );
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

async function fetchAllGroupChapters(
  comicId: string,
  groups: DetailApiGroup[],
) {
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
    const apiUrl = `${API_BASE}/comic/${encodeURIComponent(comicId)}/group/${encodeURIComponent(groupPathWord)}/chapters?${params.toString()}`;
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
    String(item.status?.display ?? "").trim() ||
    String(item.status?.value ?? "").trim();
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
      createBasicMetadata(
        "latest",
        "更新",
        item.last_chapter_name ? [item.last_chapter_name] : [],
      ),
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

async function searchComic(payload: SearchPayload = {}) {
  const extern = toStringMap(payload.extern);
  const page = Math.max(1, Number(payload.page ?? 1) || 1);
  const keyword = String(payload.keyword ?? extern.keyword ?? "").trim();
  if (!keyword) {
    throw new Error("keyword 不能为空");
  }

  const offset = (page - 1) * SEARCH_PAGE_SIZE;
  const params = new URLSearchParams({
    limit: String(SEARCH_PAGE_SIZE),
    offset: String(offset),
    q: keyword,
    q_type: "",
    platform: "1",
  });
  const apiUrl = `${API_BASE}/search/comic?${params.toString()}`;
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: getApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`搜索请求失败(${response.status})`);
  }
  const json = (await response.json()) as CopyApiResponse<SearchApiData>;
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
  const limit =
    Number.isFinite(limitValue) && limitValue > 0
      ? limitValue
      : SEARCH_PAGE_SIZE;
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
  const comicId = String(payload.comicId ?? "").trim();
  if (!comicId) {
    throw new Error("comicId 不能为空");
  }
  const params = new URLSearchParams({
    platform: "1",
  });
  const detailUrl = `${API_BASE}/comic2/${encodeURIComponent(comicId)}?${params.toString()}`;
  const detailResp = await fetchCopyApi<DetailApiResult>(detailUrl);
  const result = toStringMap(detailResp.results) as DetailApiResult;
  const detail = toStringMap(result.comic) as DetailApiComic;

  const authorNames = Array.isArray(detail.author)
    ? detail.author
        .map((item) => String(item?.name ?? "").trim())
        .filter(Boolean)
    : [];
  const themeNames = Array.isArray(detail.theme)
    ? detail.theme
        .map((item) => String(item?.name ?? "").trim())
        .filter(Boolean)
    : [];
  const statusText =
    String(detail.status?.display ?? "").trim() ||
    String(detail.status?.value ?? "").trim();
  const groups = normalizeGroups(result.groups ?? detail.groups);

  const eps = await fetchAllGroupChapters(comicId, groups);
  const updateText = formatDateTime(detail.datetime_updated);
  const title = String(detail.name ?? "").trim() || comicId;
  const coverUrl = String(detail.cover ?? "").trim();
  const popular = Number(result.popular ?? detail.popular ?? 0) || 0;
  const regionText = String(detail.region?.display ?? "").trim();
  const freeTypeText = String(detail.free_type?.display ?? "").trim();
  const restrictText = String(detail.restrict?.display ?? "").trim();
  const reclassText = String(detail.reclass?.display ?? "").trim();
  const lastChapterName = String(detail.last_chapter?.name ?? "").trim();
  const groupMetaText = groups
    .map((group) => {
      const name = String(group.name ?? "").trim();
      const count = Number(group.count ?? 0) || 0;
      return name ? `${name}${count > 0 ? `(${count})` : ""}` : "";
    })
    .filter(Boolean);

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
        createMetadataActionList("author", "作者", authorNames),
        createMetadataActionList("tags", "标签", themeNames),
        createMetadataActionList(
          "region",
          "地区",
          regionText ? [regionText] : [],
        ),
        createMetadataActionList(
          "freeType",
          "收费",
          freeTypeText ? [freeTypeText] : [],
        ),
        createMetadataActionList(
          "restrict",
          "限制",
          restrictText ? [restrictText] : [],
        ),
        createMetadataActionList(
          "lastChapter",
          "最新章节",
          lastChapterName ? [lastChapterName] : [],
        ),
        createMetadataActionList("groups", "分组", groupMetaText),
        createMetadataActionList(
          "status",
          "状态",
          statusText ? [statusText] : [],
        ),
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
  const inputChapterId = String(
    payload.chapterId ?? extern.chapterId ?? "",
  ).trim();

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
    ...getApiHeaders(),
  };
  const localToken = await loadAuthToken();
  if (localToken) {
    headers.authorization = `Token ${localToken}`;
  }
  const chapterContent = await getChapterContentWithCache(
    comicId,
    chapterId,
    headers,
  );
  const imageUrls = sortChapterImageUrls(
    chapterContent.contents,
    chapterContent.words,
  );
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
            extern: toStringMap(
              toStringMap(toStringMap(comicInfo.creator).avatar).extern,
            ),
          },
          extern: toStringMap(toStringMap(comicInfo.creator).extern),
        },
        titleMeta: Array.isArray(comicInfo.titleMeta)
          ? comicInfo.titleMeta
          : [],
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
  const inputChapterId = String(
    payload.chapterId ?? extern.chapterId ?? "",
  ).trim();
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

  const headers: Record<string, string> = {
    ...getApiHeaders(),
  };
  const localToken = await loadAuthToken();
  if (localToken) {
    headers.authorization = `Token ${localToken}`;
  }
  const chapterContent = await getChapterContentWithCache(
    comicId,
    chapterId,
    headers,
  );
  const imageUrls = sortChapterImageUrls(
    chapterContent.contents,
    chapterContent.words,
  );
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
}

async function fetchImageBytes({
  url = "",
  timeoutMs = 30000,
}: FetchImagePayload = {}) {
  const targetUrl = String(url).trim();
  if (!targetUrl) {
    throw new Error("url 不能为空");
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const resolvedTimeout = Math.max(0, Number(timeoutMs) || 30000);
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, resolvedTimeout)
    : undefined;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        ...getApiHeaders(),
        Referer: "https://www.copymanga.tv/",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "x-rquickjs-host-offload-binary-v1": "1",
      },
      signal: controller?.signal,
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }

  if (!response.ok) {
    throw new Error(`图片请求失败(${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("图片数据为空");
  }
  const nativeBufferId = await runtime.native.put(bytes);

  return {
    nativeBufferId: Number(nativeBufferId),
  };
}

async function getSettingsBundle() {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [
        // {
        //   id: "account",
        //   title: "账号",
        //   fields: [
        //     { key: "auth.account", kind: "text", label: "用户名" },
        //     { key: "auth.password", kind: "password", label: "密码" },
        //   ],
        // },
      ],
    },
    data: {
      canShowUserInfo: false,
      values: {
        "auth.account": "",
        "auth.password": "",
      },
    },
  };
}

export default {
  getInfo,
  searchComic,
  getComicDetail,
  getChapter,
  getReadSnapshot,
  fetchImageBytes,
  getSettingsBundle,
};
