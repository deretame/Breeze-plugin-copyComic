import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const HEADERS = {
  Accept: "application/json",
  version: "2025.05.09",
  Origin: "https://2025copy.com",
  region: "0",
  webp: "0",
  platform: "1",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Mobile Safari/537.36 iDOKit/1.0.0 RSSX/1.0.0",
};

const API_BASE = "https://api.copy3000.com/api/v3";
const COMIC_ID = "ouxiangkuangre";

function decodeBuffer(buf) {
  // 自动检测 gzip：magic number 0x1f 0x8b
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf).toString("utf8");
  }
  return buf.toString("utf8");
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const text = decodeBuffer(buf);
  return JSON.parse(text);
}

// 1. 章节列表
const list = await fetchJson(
  `${API_BASE}/comic/${COMIC_ID}/group/default/chapters?limit=500&offset=0`,
);
console.log("章节数:", list.results.list.length);

// 2. 第一个章节内容
const first = list.results.list[0];
const content = await fetchJson(`${API_BASE}/comic/${COMIC_ID}/chapter2/${first.uuid}?platform=1`);
console.log("章节:", content.results.chapter.name, "图片数:", content.results.chapter.size);
console.log("第一张:", content.results.chapter.contents[0].url);

writeFileSync("test_result.json", JSON.stringify(content, null, 2));
