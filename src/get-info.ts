import { PLUGIN_ID } from "./common";

export function buildPluginInfo() {
  return {
    name: "拷贝漫画",
    uuid: PLUGIN_ID,
    iconUrl: "https://httpstat.us/404",
    creator: {
      name: "example",
      describe: "占位作者信息",
    },
    describe: "拷贝漫画插件",
    version: "0.0.1",
    home: "https://example.com",
    updateUrl: "https://httpstat.us/404",
    function: [],
  };
}

export function buildManifestInfo() {
  return buildPluginInfo();
}
