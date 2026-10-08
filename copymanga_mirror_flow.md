# 拷贝漫画镜像站 (ios.2026copy.com) 数据获取完整流程

> 基于对镜像站前端 JS 的逆向验证（2026-07），覆盖 **搜索 → 详情 → 章节列表 → 章节图片** 全链路。
> 测试脚本：`test-search.mjs`（`node test-search.mjs [关键词]`）
> 仅供学习测试。镜像站随时可能更换域名或停用。

---

## 〇、总体架构

镜像站所有数据均可在**不登录**的情况下获取，共 4 层：

| 层级        | 方式                                  | 加密        |
| ----------- | ------------------------------------- | ----------- |
| 1. 搜索     | JSON API                              | 无          |
| 2. 详情     | SSR HTML（cheerio 解析）              | 无          |
| 3. 章节列表 | JSON API + AES-128-CBC                | ✅ 响应加密 |
| 4. 章节图片 | 阅读页内嵌 `contentKey` + AES-128-CBC | ✅ 数据加密 |

通用请求头：

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36
Accept: application/json        # API 请求
Referer: https://ios.2026copy.com/   # 下载图片时必须携带
```

---

## 一、搜索漫画（无需登录、无加密）

```
GET https://ios.2026copy.com/api/kb/web/searchci/comics
    ?offset=0&platform=2&limit=12&q={关键词}&q_type=
```

**注意**：路径是 `searchci`（不是 `searchs`）。`q_type` 可留空（默认按名称），可取值 `name` / `author` / `local`。

响应（`code: 200` 即成功）：

```json
{
  "code": 200,
  "message": "请求成功",
  "results": {
    "total": 21,
    "limit": 3,
    "offset": 0,
    "list": [
      {
        "name": "海贼王",
        "path_word": "haizeiwang",
        "cover": "https://sh.mangafunb.fun/h/haizeiwang/cover/1651422982.jpg.328x422.jpg",
        "author": [{ "name": "尾田栄一郎", "path_word": "weitianrongyilang" }],
        "popular": 12553772
      }
    ]
  }
}
```

关键字段：`path_word`（漫画唯一标识，后续所有接口都要用）。

---

## 二、漫画详情（SSR HTML）

```
GET https://ios.2026copy.com/comic/{path_word}
```

详情页为服务端渲染，直接解析 HTML：

| 数据                                   | 选择器 / 位置                                            |
| -------------------------------------- | -------------------------------------------------------- |
| 页面标题                               | `<title>`（含最新话数、状态）                            |
| 名称/别名/作者/热度/最後更新/狀態/題材 | `.comicParticulars-title-right` 文本块，按 `标签：` 分割 |
| 简介                                   | `p.intro`（需移除 `.comicDetailAds` 等广告节点）         |

cheerio 解析示例：

```javascript
import * as cheerio from "cheerio";

const $ = cheerio.load(html);
const infoBlock = $(".comicParticulars-title-right").first().text().replace(/\s+/g, " ").trim();
const field = (label) => {
  const re = new RegExp(`${label}：\\s*([\\s\\S]*?)(?=\\s+(?:作者|熱度|最後更新|狀態|題材)：|$)`);
  const m = infoBlock.match(re);
  return m ? m[1].trim() : "";
};
const $intro = $("p.intro").first();
$intro.find('.comicDetailAds, script, style, .ad, [class*="advert"]').remove();
const intro = $intro.text().replace(/\s+/g, " ").trim();

// 结果示例:
// 页面标题: 海贼王-海贼王漫畫-第1189话-連載中-冒險漫画,热血漫画-在线阅读 - 拷貝漫畫 拷贝漫画
// 作者: 尾田栄一郎 | 熱度: 1267.4W | 狀態: 連載中 | 最後更新: 2026-07-29
```

同时该页面还内嵌了下一步要用的两个凭证（见下文）。

---

## 三、章节列表（JSON API + AES 加密）

### 3.1 提取凭证

详情页 HTML 内嵌脚本中提取两个值：

```html
<!-- 详情页内嵌 <script> 中 -->
<input id="dnt" value="3" ... />
<!-- dnts 请求头值 -->
<script>
  var ccz = "op0zzpvv.nmn.00p";
</script>
<!-- AES key -->
```

提取正则：

```javascript
const dnts = html.match(/id="dnt"[^>]*value="([^"]*)"/)?.[1] ?? "";
const aesKey = html.match(/var ccz = '([^']*)'/)?.[1] ?? "";
```

### 3.2 请求接口

```
GET https://ios.2026copy.com/comicdetail/{path_word}/chapters
Headers:
    dnts: {上面提取的值}      ← 必须
    User-Agent: ...
```

**注意**：路径是 `/comicdetail/{path_word}/chapters`（不是 `/api/...`），**必须带 `dnts` 请求头**，否则拿不到数据。

### 3.3 解密响应

响应 `results` 字段为 hex 密文，解密规则（与前端 `comic_detail_pass202508141558.js` 逻辑一致）：

| 参数 | 取值                                     |
| ---- | ---------------------------------------- |
| 算法 | AES-128-CBC / Pkcs7                      |
| key  | `ccz`（UTF-8，16 字节）                  |
| IV   | 密文**前 16 个字符**（UTF-8，16 字节）   |
| 密文 | 从第 16 个字符开始的剩余部分（hex 解码） |

```javascript
import { createDecipheriv } from "node:crypto";

function decryptChapters(cipherHex, aesKey) {
  const iv = Buffer.from(cipherHex.slice(0, 16), "utf8");
  const data = Buffer.from(cipherHex.slice(16), "hex");
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(aesKey, "utf8"), iv);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
```

解密后的 JSON 结构：

```json
{
  "build": { "path_word": "haizeiwang", "type": [{"id": 1, "name": "話"}, ...] },
  "groups": {
    "default": {
      "path_word": "default",
      "count": 394,
      "name": "默認",
      "chapters": [
        { "type": 2, "name": "1卷", "id": "4bd05882-c7bc-11e8-881a-024352452ce0" },
        ...
      ]
    }
  }
}
```

`id` 即章节 UUID，是阅读页（图片）接口的入参。`count` 是章节总数（分页时可用于判断是否取完）。

---

## 四、章节图片（阅读页内嵌数据 + AES 加密）

### 4.1 请求阅读页

```
GET https://ios.2026copy.com/comic/{path_word}/chapter/{chapter_uuid}
```

阅读页内嵌脚本中提取两个值：

```html
<script>
  var cct = "op0zzpvv.nmn.00p"; // AES key（与 ccz 相同）
  var contentKey = "BbY0Ag1rscP64SEvabc66d256938f3a0..."; // 超长 hex 数据（含 IV + 密文）
</script>
```

提取正则：

```javascript
const cct = html.match(/var cct = '([^']*)'/)?.[1] ?? "";
const contentKey = html.match(/var contentKey = '([^']*)'/)?.[1] ?? "";
```

### 4.2 解密图片列表

| 参数 | 取值                                                  |
| ---- | ----------------------------------------------------- |
| 算法 | AES-128-CBC / Pkcs7                                   |
| key  | `cct`（UTF-8，16 字节）                               |
| IV   | `contentKey` **前 16 个字符**（UTF-8）                |
| 密文 | `contentKey` 从第 16 个字符开始的剩余部分（hex 解码） |

> ⚠️ 前端 JS 源码写的是 `contentKey.substring(2, 16)` 作 IV，但实测 `contentKey[0..16)` 才能正确解密，以实际行为为准。

```javascript
function decryptContentKey(contentKey, cct) {
  const iv = Buffer.from(contentKey.slice(0, 16), "utf8");
  const data = Buffer.from(contentKey.slice(16), "hex");
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(cct, "utf8"), iv);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
```

解密结果：图片 URL 数组（一张图一个对象）：

```json
[
  { "url": "https://sh.mangafunb.fun/h/haizeiwang/2390e/1647114796900001.jpg.c1500x.jpg" },
  { "url": "https://sh.mangafunb.fun/h/haizeiwang/2390e/1647114799790002.jpg.c1500x.jpg" }
]
```

### 4.3 下载图片

```
GET {url}
Headers:
    User-Agent: ...
    Referer: https://ios.2026copy.com/    ← 必须，否则可能被拒绝
```

已验证：HTTP 200，JPEG 魔数 `ffd8ff`，可直接保存为 `.jpg`。

---

## 五、测试脚本速查

```
node test-search.mjs 海贼王     # 全链路：搜索 → 详情 → 章节 → 图片 URL
```

脚本内函数一览：

| 函数                                      | 说明                                       |
| ----------------------------------------- | ------------------------------------------ |
| `search(keyword, {limit, offset})`        | 搜索，返回 `{list, total}`                 |
| `getComicDetail(pathWord)`                | cheerio 解析详情页                         |
| `getChapters(pathWord)`                   | 提取凭证 → 请求加密接口 → 解密章节列表     |
| `getChapterImages(pathWord, chapterUuid)` | 抓阅读页 → 解密 contentKey → 图片 URL 数组 |

---

## 六、逆向要点备忘（写给后续维护）

1. **加密逻辑位置**：章节接口逻辑在 `comic_detail_pass202508141558.js`，图片逻辑在 `comic_content_pass202508141534.js`（均为 packer + obfuscator 双层混淆的 webpack 模块）。
2. **字符串字典洗牌**：混淆代码顶层的字符串数组加载后会先做 shift/push 洗牌（循环直到算术条件成立，如 `0x4c023`），**直接读源码数组解码是错的**；需在 Node 中执行洗牌逻辑后再查表。
3. **凭证来源**：`dnts` 与 AES key（`ccz`/`cct`）都内嵌在页面 HTML 中，先抓页面再取凭证，不要写死（站点可能轮换）。
4. **官方 API 域名**（`api.2025copy.com` / `api.copymanga.org` 等）当前网络环境不可达（SSL 握手失败/超时），镜像站自带 `API_URL = location.origin`，走同源路径即可。
5. **易失效点**：镜像站处于搬迁维护期，部分路径可能间歇性 404（页面提示「服務器升級中」），重试即可；域名本身也可能更换。

---

## 七、密钥获取过程（逆向溯源）

> 本节回答一个问题：`dnts`、`ccz`/`cct`、`contentKey` 这些密钥/凭证**不是猜出来的**，而是顺着前端 JS 的执行路径逐层找到的。完整链条如下。

### 7.1 线索起点：章节接口返回密文

直接猜接口路径 `/api/kb/web/comic/...` 全部 404 后，改为逆向前端。发现详情页引用的脚本中有一个是 **CryptoJS**（`bundle202002131913.js`，明文库），且章节相关 JS（`comic_detail_pass202508141558.js`）的字符串里含 `AES`、`CBC`、`Pkcs7`、`Hex`、`Utf8` → 确认响应是 **AES-CBC 加密**，但 key/iv 未知。

### 7.2 解包混淆 JS，找到 key 的"引用名"

`comic_detail_pass202508141558.js` 是双层混淆：

```
第一层 packer:      eval(function(p,a,c,k,e,r){...}('压缩内容',[],319,'字典'.split('|'),0,{}))
第二层 obfuscator:  十六进制字符串索引 _0x15ec(0x12d) + 数组洗牌
```

**解包 packer**（还原压缩内容 + 按 base36 token 替换字典词）后，代码变成可读的混淆形式，其中两处关键逻辑直接暴露：

```javascript
// ① 请求 URL 与请求头 —— 发现路径 /comicdetail/... 和 dnts 头
request({
  type: 'GET',
  headers: { 'dnts': document.querySelector('#dnt').getAttribute('value') },  // ← dnts 来自页面 #dnt 元素
  url: window.location.origin + '/comicdetail/' + path_word + '/chapters',
  ...
})

// ② 解密逻辑 —— 发现 key 来自一个"全局变量" ccz
var _0x8fc01e = CryptoJS.enc.Utf8.parse(ccz);   // ← key 变量名 ccz
var _0x37db36 = CryptoJS.enc.Utf8.parse(密文前16字符);  // ← IV 是密文前 16 字符
CryptoJS.AES.decrypt(密文, _0x8fc01e, { iv: _0x37db36, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 })
```

> 注意：此脚本的字符串字典被"洗牌"过，直接用源码数组查 `0x12d` 得到的是错误字符串；必须在 Node 里先执行洗牌循环（`while` 条件 `0x4c023`），再查表才是 `'/comicdetail/'`、`'/chapters'`、`'location'`、`'origin'` 等真实值。

### 7.3 回页面 HTML 搜 `ccz` → 找到密钥本体

解包代码只给了**变量名** `ccz`，它不在任何 JS 文件里定义（全部脚本 grep 无果）。继续在**详情页 HTML 的内嵌 `<script>`** 中搜索，命中：

```html
<script>
  var ccz = 'op0zzpvv.nmn.00p';     // ← AES key 本体（16 字节 = AES-128）
  ...
</script>
<input id="dnt" value="3" /> // ← dnts 请求头值（同一页面）
```

### 7.4 图片接口的密钥：同一套路复制

阅读页（`/comic/{path_word}/chapter/{uuid}`）引用 `comic_content_pass202508141534.js`，解包后同样看到：

```javascript
var _0x3a0024 = contentKey;                          // ← 全局变量 contentKey（页面下发）
var _0x4d1a96 = contentKey.substring(2, 0x10);       // 源码写法：IV（实测应为 [0..16)）
var _0x3ca2e9 = contentKey.substring(0x10, length);  // 密文部分（hex）
var _0x8fc01e = CryptoJS.enc.Utf8.parse(cct);        // ← key 变量名 cct
CryptoJS.AES.decrypt(..., _0x8fc01e, { iv: ..., mode: CBC, padding: Pkcs7 })
```

回**阅读页 HTML** 内嵌 `<script>` 搜索，命中：

```html
<script>
  var cct = "op0zzpvv.nmn.00p"; // ← key（与 ccz 相同）
  var contentKey = "BbY0Ag1rscP64SEv..."; // ← IV(16字符) + hex 密文，直接解密即图片 URL 列表
</script>
```

### 7.5 结论：密钥体系的本质

| 凭证         | 存放位置                                  | 获取方式       | 备注                         |
| ------------ | ----------------------------------------- | -------------- | ---------------------------- |
| `dnts`       | 详情页 `<input id="dnt" value="...">`     | 正则提取 value | 章节接口请求头               |
| `ccz`        | 详情页内嵌 `<script>var ccz='...'`        | 正则提取       | 章节列表 AES key             |
| `cct`        | 阅读页内嵌 `<script>var cct='...'`        | 正则提取       | 图片列表 AES key             |
| `contentKey` | 阅读页内嵌 `<script>var contentKey='...'` | 正则提取       | 含 IV + 密文，本身即数据载体 |

**规律**：

- 密钥不写死在 JS 里，而是**由服务器随页面下发**（每次打开页面都有），所以抓取流程必须是"先抓页面 → 提取凭证 → 再请求数据"，不能硬编码。
- 当前 `ccz` 与 `cct` 值相同（`op0zzpvv.nmn.00p`，恰好 16 字节 = AES-128 key），但站点随时可能轮换，提取逻辑必须保留。
- 发现路径总结：`密文响应 → 识别 CryptoJS → 解包混淆 JS → 找到变量引用名（ccz/cct/contentKey）→ 回页面 HTML 搜变量 → 命中密钥`。
