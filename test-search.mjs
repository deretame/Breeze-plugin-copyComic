/**
 * 测试文件：验证拷贝漫画镜像站 (ios.2026copy.com) 搜索 + 详情 + 章节抓取
 * 运行: node test-search.mjs [关键词]
 * 说明: 仅供学习测试，不参与构建；HTML 解析使用 cheerio，章节解密使用 node:crypto
 */
import * as cheerio from "cheerio";
import { createDecipheriv } from "node:crypto";

const BASE = "https://ios.2026copy.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 从详情页 HTML 提取页面内嵌的请求凭证（dnts + AES key） */
function extractCredentials(html) {
  return {
    dnts: html.match(/id="dnt"[^>]*value="([^"]*)"/)?.[1] ?? "",
    aesKey: html.match(/var ccz = '([^']*)'/)?.[1] ?? "",
  };
}

/** AES-CBC 解密章节数据（模拟前端逻辑：IV=密文前16字符UTF-8，key=ccz，Pkcs7） */
function decryptChapters(cipherHex, aesKey) {
  const iv = Buffer.from(cipherHex.slice(0, 16), "utf8");
  const data = Buffer.from(cipherHex.slice(16), "hex");
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(aesKey, "utf8"), iv);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}

/** 获取章节图片 URL 列表（解密阅读页内嵌 contentKey：key=cct，IV=contentKey前16字符） */
async function getChapterImages(pathWord, chapterUuid) {
  const res = await fetch(`${BASE}/comic/${pathWord}/chapter/${chapterUuid}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`阅读页 HTTP ${res.status}`);
  const html = await res.text();

  const cct = html.match(/var cct = '([^']*)'/)?.[1] ?? "";
  const contentKey = html.match(/var contentKey = '([^']*)'/)?.[1] ?? "";
  if (!cct || !contentKey) throw new Error("阅读页未找到 cct/contentKey");

  const iv = Buffer.from(contentKey.slice(0, 16), "utf8");
  const data = Buffer.from(contentKey.slice(16), "hex");
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(cct, "utf8"), iv);
  const json = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(json); // [{ url, ... }, ...]
}

/** 搜索漫画（无需登录） */
async function search(keyword, { limit = 5, offset = 0 } = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    platform: "2",
    limit: String(limit),
    q: keyword,
    q_type: "",
  });
  const res = await fetch(`${BASE}/api/kb/web/searchci/comics?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`业务错误: ${json.message}`);
  return json.results; // { list, total, limit, offset }
}

/** 获取章节列表（加密接口，需先抓详情页拿 dnts + key） */
async function getChapters(pathWord) {
  // 先抓详情页获取凭证
  const page = await fetch(`${BASE}/comic/${pathWord}`, { headers: { "User-Agent": UA } });
  const { dnts, aesKey } = extractCredentials(await page.text());
  if (!dnts || !aesKey) throw new Error("详情页未找到 dnts/aesKey");

  // 请求加密的章节接口
  const res = await fetch(`${BASE}/comicdetail/${pathWord}/chapters`, {
    headers: { "User-Agent": UA, Accept: "application/json", dnts },
  });
  const json = await res.json();
  if (json.code !== 200) throw new Error(`章节接口失败: ${json.message}`);

  return decryptChapters(json.results, aesKey);
}

/** 从网页版详情页解析漫画详情（cheerio 解析 SSR HTML） */
async function getComicDetail(pathWord) {
  const res = await fetch(`${BASE}/comic/${pathWord}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());

  // 页面标题: "海贼王-海贼王漫畫-第1189话-連載中-... - 拷貝漫畫 拷贝漫画"
  const pageTitle = $("title").text().trim();

  // 标题信息区整块文本: 別名/作者/熱度/最後更新/狀態/題材
  const infoBlock = $(".comicParticulars-title-right").first().text().replace(/\s+/g, " ").trim();

  // 从信息块解析字段（匹配到下一个标签前为止）
  const field = (label) => {
    const re = new RegExp(`${label}：\\s*([\\s\\S]*?)(?=\\s+(?:作者|熱度|最後更新|狀態|題材)：|$)`);
    const m = infoBlock.match(re);
    return m ? m[1].trim() : "";
  };

  // 简介: p.intro 区块（去掉内部广告）
  const $intro = $("p.intro").first();
  $intro.find('.comicDetailAds, script, style, .ad, [class*="advert"]').remove();
  const intro = $intro.text().replace(/\s+/g, " ").trim();

  return {
    pageTitle,
    name: infoBlock.split(/\s+別名：/)[0] || "",
    author: field("作者"),
    popular: field("熱度"),
    lastUpdate: field("最後更新"),
    status: field("狀態"),
    intro: intro.slice(0, 300),
  };
}

async function main() {
  const keyword = process.argv[2] || "海贼王";
  console.log(`\n========== 搜索: "${keyword}" ==========\n`);

  const { list, total } = await search(keyword);
  console.log(`共找到 ${total} 部漫画，本次返回 ${list.length} 部:\n`);

  for (const item of list) {
    console.log(`📖 ${item.name}`);
    console.log(`   path_word: ${item.path_word}`);
    console.log(`   作者: ${(item.author ?? []).map((a) => a.name).join("、") || "未知"}`);
    console.log(`   热度: ${item.popular?.toLocaleString() ?? "-"}`);
    console.log(`   封面: ${item.cover}`);
    console.log("");
  }

  // 取第一部验证详情页抓取
  if (list[0]) {
    console.log(`--- 验证详情页 /comic/${list[0].path_word} (cheerio 解析) ---`);
    const detail = await getComicDetail(list[0].path_word);
    console.log(`   页面标题: ${detail.pageTitle}`);
    console.log(`   名称: ${detail.name} | 作者: ${detail.author}`);
    console.log(
      `   热度: ${detail.popular} | 狀態: ${detail.status} | 最後更新: ${detail.lastUpdate}`,
    );
    console.log(`   简介(截取): ${detail.intro}`);
    console.log("");

    // 验证章节列表（加密接口 + AES 解密）
    console.log(`--- 验证章节列表 /comicdetail/${list[0].path_word}/chapters ---`);
    const chapters = await getChapters(list[0].path_word);
    const group = chapters.groups?.default;
    console.log(`   章节组: ${group?.name} | 章节总数: ${group?.count}`);
    const sample = (group?.chapters ?? []).slice(0, 3);
    for (const ch of sample) {
      console.log(`   📄 ${ch.name} (uuid: ${ch.id})`);
    }
    console.log("");

    // 验证章节图片（解密阅读页 contentKey）
    const firstChapter = group?.chapters?.[0];
    if (firstChapter) {
      console.log(`--- 验证章节图片 /comic/${list[0].path_word}/chapter/${firstChapter.id} ---`);
      const images = await getChapterImages(list[0].path_word, firstChapter.id);
      console.log(`   图片数量: ${images.length}`);
      for (const img of images.slice(0, 3)) {
        console.log(`   🖼️ ${img.url}`);
      }
      console.log("");
    }
  }
}

main().catch((err) => {
  console.error("❌ 失败:", err.message);
  process.exit(1);
});
