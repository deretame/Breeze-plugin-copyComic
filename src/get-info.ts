import { PLUGIN_ID } from "./common";

function buildManifestComicListScene(input: {
  title: string;
  list: {
    fnPath: string;
    core?: Record<string, unknown>;
    extern?: Record<string, unknown>;
  };
  filter?: {
    fnPath: string;
    core?: Record<string, unknown>;
    extern?: Record<string, unknown>;
  };
}) {
  return {
    title: input.title,
    source: PLUGIN_ID,
    list: {
      fnPath: input.list.fnPath,
      core: input.list.core ?? {},
      extern: input.list.extern ?? {},
    },
    ...(input.filter
      ? {
          filter: {
            fnPath: input.filter.fnPath,
            core: input.filter.core ?? {},
            extern: input.filter.extern ?? {},
          },
        }
      : {}),
  };
}

export function buildPluginInfo() {
  return {
    name: "拷贝漫画",
    uuid: PLUGIN_ID,
    iconUrl:
      "https://raw.githubusercontent.com/deretame/Breeze-plugin-copyComic/main/assets/u3.png",
    creator: {
      name: "",
      describe: "",
    },
    describe: "拷贝漫画插件",
    version: "0.0.5",
    home: "https://github.com/deretame/Breeze-plugin-copyComic",
    updateUrl: "https://api.github.com/repos/deretame/Breeze-plugin-copyComic/releases/latest",
    function: [
      {
        id: "recommend",
        title: "漫画推荐",
        action: {
          type: "openComicList",
          payload: {
            scene: buildManifestComicListScene({
              title: "漫画推荐",
              list: { fnPath: "getHomeRecommend", extern: {} },
            }),
          },
        },
      },
      {
        id: "newest",
        title: "全新上架",
        action: {
          type: "openComicList",
          payload: {
            scene: buildManifestComicListScene({
              title: "全新上架",
              list: { fnPath: "getHomeNewest", extern: {} },
            }),
          },
        },
      },
      {
        id: "discover",
        title: "发现",
        action: {
          type: "openComicList",
          payload: {
            scene: buildManifestComicListScene({
              title: "发现",
              list: { fnPath: "getHomeDiscover", extern: {} },
              filter: { fnPath: "getHomeDiscoverFilterBundle", extern: {} },
            }),
          },
        },
      },
      {
        id: "rank",
        title: "排行榜",
        action: {
          type: "openComicList",
          payload: {
            scene: buildManifestComicListScene({
              title: "排行榜",
              list: { fnPath: "getHomeRank", extern: {} },
              filter: { fnPath: "getHomeRankFilterBundle", extern: {} },
            }),
          },
        },
      },
    ],
  };
}

export function buildManifestInfo() {
  return buildPluginInfo();
}
