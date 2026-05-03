import { PLUGIN_ID } from "./common";

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
    version: "0.0.3",
    home: "https://github.com/deretame/Breeze-plugin-copyComic",
    updateUrl: "https://api.github.com/repos/deretame/Breeze-plugin-copyComic/releases/latest",
    function: [],
  };
}

export function buildManifestInfo() {
  return buildPluginInfo();
}
