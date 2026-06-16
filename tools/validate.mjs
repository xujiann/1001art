/* 数据校验：确保 data.js 与 images/ 一致、字段齐全。
   用法：node tools/validate.mjs    （在项目根目录运行）
   退出码非 0 表示发现问题，可接入 CI。
*/
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {};
await import("file://" + join(ROOT, "data.js").replace(/\\/g, "/"));
const DATA = globalThis.window.ART_DATA || [];

const REQ = ["id","sy","th","title","title_en","artist","artist_en","year","era","era_en","medium","country","location","desc"];
const THEMES = new Set(["prehistoric","ancient","egypt","greece","rome","byzantine","medieval","gothic","renaissance","baroque","rococo","neoclassic","romantic","realism","impressionism","modern","contemporary","default"]);

const errs = [];
const warns = [];

if (DATA.length !== 1001) errs.push(`作品总数应为 1001，实际 ${DATA.length}`);

const ids = new Set();
let withImg = 0, placeholders = 0;
for (const d of DATA) {
  if (ids.has(d.id)) errs.push(`重复 id: ${d.id}`);
  ids.add(d.id);
  for (const k of REQ) if (d[k] === undefined || d[k] === null || d[k] === "") errs.push(`#${d.id} 缺字段 ${k}`);
  if (!THEMES.has(d.th)) warns.push(`#${d.id} 未知主题 th=${d.th}`);
  if (d.img) {
    withImg++;
    if (!existsSync(join(ROOT, d.img))) errs.push(`#${d.id} 大图缺失: ${d.img}`);
    if (!d.thumb || !existsSync(join(ROOT, d.thumb))) errs.push(`#${d.id} 缩略图缺失: ${d.thumb}`);
  } else {
    placeholders++;
  }
}

const trad = DATA.filter(d => /[繁體藝術館瑩寶劍鑑廣國學畫單]/.test(`${d.title}${d.location}${d.artist}${d.era}`));
if (trad.length) warns.push(`疑似繁体残留 ${trad.length} 条：${trad.slice(0,5).map(d=>d.id).join(",")}…`);

console.log(`作品 ${DATA.length} | 有本地图 ${withImg} | 占位 ${placeholders}`);
if (warns.length) { console.log("\n⚠ 警告:"); warns.slice(0,20).forEach(w => console.log("  " + w)); }
if (errs.length) { console.log("\n✗ 错误:"); errs.slice(0,40).forEach(e => console.log("  " + e)); console.log(`\n共 ${errs.length} 个错误`); process.exit(1); }
console.log("\n✓ 校验通过");
