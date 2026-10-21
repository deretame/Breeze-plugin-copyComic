import type { InfoContract } from "breeze-plugin-kit";
import { PLUGIN_ID, PLUGIN_VERSION } from "./config";

export function buildPluginInfo(): InfoContract {
  return {
    name: "拷贝漫画",
    uuid: PLUGIN_ID,
    iconUrl:
      "https://raw.githubusercontent.com/deretame/Breeze-plugin-copyComic/main/assets/u3.webp",
    describe: "拷贝漫画插件",
    version: PLUGIN_VERSION,
    home: "https://github.com/deretame/Breeze-plugin-copyComic",
    updateUrl: "https://api.github.com/repos/deretame/Breeze-plugin-copyComic/releases/latest",
    npmName: "breeze-plugin-copy-comic",
    haveHome: true,
    haveCloudFavorite: true,
    function: [
      {
        id: "recommend",
        title: "漫画推荐",
        action: {
          type: "openComicList",
          payload: {
            scene: {
              title: "漫画推荐",
              source: PLUGIN_ID,
              body: {
                type: "pluginPagedComicList",
                request: {
                  fnPath: "getHomeRecommend",
                  core: {},
                  extern: {},
                },
              },
            },
          },
        },
      },
      {
        id: "newest",
        title: "全新上架",
        action: {
          type: "openComicList",
          payload: {
            scene: {
              title: "全新上架",
              source: PLUGIN_ID,
              body: {
                type: "pluginPagedComicList",
                request: {
                  fnPath: "getHomeNewest",
                  core: {},
                  extern: {},
                },
              },
            },
          },
        },
      },
      {
        id: "discover",
        title: "发现",
        action: {
          type: "openComicList",
          payload: {
            scene: {
              title: "发现",
              source: PLUGIN_ID,
              body: {
                type: "pluginPagedComicList",
                request: {
                  fnPath: "getHomeDiscover",
                  core: {},
                  extern: {},
                },
              },
              filter: {
                fnPath: "getHomeDiscoverFilterBundle",
                core: {},
                extern: {},
              },
            },
          },
        },
      },
      {
        id: "rank",
        title: "排行榜",
        action: {
          type: "openComicList",
          payload: {
            scene: {
              title: "排行榜",
              source: PLUGIN_ID,
              body: {
                type: "pluginPagedComicList",
                request: {
                  fnPath: "getHomeRank",
                  core: {},
                  extern: {},
                },
              },
              filter: {
                fnPath: "getHomeRankFilterBundle",
                core: {},
                extern: {},
              },
            },
          },
        },
      },
      {
        id: "cloudFavorite",
        title: "云端收藏",
        action: {
          type: "openComicList",
          payload: {
            scene: {
              title: "云端收藏",
              source: PLUGIN_ID,
              body: {
                type: "pluginPagedComicList",
                request: {
                  fnPath: "getCloudFavoriteData",
                  core: {},
                  extern: { source: "cloudFavorite" },
                },
              },
              filter: {
                fnPath: "getCloudFavoriteFilterBundle",
                core: {},
                extern: { source: "cloudFavorite" },
              },
            },
          },
        },
      },
    ],
  };
}

export function buildManifestInfo(): InfoContract {
  return buildPluginInfo();
}
