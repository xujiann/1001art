// 把超过腾讯云数据万象 32MB 处理上限的源图压到限内。
//
// 病灶（线上真故障）：这 15 张的缩略图请求返回 `ImageTooLarge`，
// 也就是说三站上这些作品的卡片与详情图**全是坏的**——而不是「慢」或「大」。
// 阈值实测精确落在 32MB：最小失败 32.1MB、最大成功 31.6MB。
//
// 做法：保持 id 与 URL 不变，只把文件本身压到 30MB 以下（留余量）。
// 先降 JPEG 质量，仍超限再按长边逐级缩小——优先保住像素尺寸，因为
// 「查看原图」是本站唯一提供全分辨率的地方，读者会用它看笔触。
// 跑法（在站点根目录，因为读写的是 ./images）：
//   LIST=_oversize.json node tools/shrink-oversize.mjs
// 压完的清单写在 _upload_shrunk.txt，接着必须重传 COS——**走分块**：
//   python tools/cos-multipart.py images art --list _upload_shrunk.txt --par 6
// （压到 30MB 仍然很大，上行限速时整份 PUT 会一直超时重来，见 cos-multipart.py 抬头）
import { readFileSync, writeFileSync, statSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import sharp from 'sharp';

const TARGET = +(process.env.TARGET_MB || 30) * 1024 * 1024;
const list = JSON.parse(readFileSync(process.env.LIST || '_oversize.json', 'utf8'));
mkdirSync('_oversize_bak', { recursive: true });

let ok = 0, fail = 0;
for (const f of list) {
  const p = `images/${f}`;
  const before = statSync(p).size;
  const bak = `_oversize_bak/${f}`;
  if (!existsSync(bak)) copyFileSync(p, bak);          // 原图留底，别无处可回
  const meta = await sharp(bak, { limitInputPixels: false }).metadata();
  let out = null, note = '';
  // ① 先降质量（不损尺寸）
  for (const q of [88, 80, 72, 64]) {
    const buf = await sharp(bak, { limitInputPixels: false }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (buf.length <= TARGET) { out = buf; note = `质量 ${q}`; break; }
  }
  // ② 仍超限再缩尺寸
  if (!out) {
    for (const scale of [0.85, 0.7, 0.55, 0.45, 0.35]) {
      const w = Math.round(meta.width * scale);
      const buf = await sharp(bak, { limitInputPixels: false }).resize({ width: w }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      if (buf.length <= TARGET) { out = buf; note = `缩至 ${Math.round(scale * 100)}%（${w}px 宽）质量 82`; break; }
    }
  }
  if (!out) { console.log(`  ✗ ${f} 压不到限内`); fail++; continue; }
  writeFileSync(p, out);
  const d = await sharp(out, { limitInputPixels: false }).metadata();
  console.log(`  ✓ ${f.padEnd(12)} ${(before / 1048576).toFixed(0).padStart(3)}MB → ${(out.length / 1048576).toFixed(1).padStart(5)}MB  ${meta.width}×${meta.height} → ${d.width}×${d.height}  ${note}`);
  ok++;
}
console.log(`\n压缩 ${ok} 张 · 失败 ${fail}（原图备份在 _oversize_bak/）`);
writeFileSync('_upload_shrunk.txt', list.join('\n'));
