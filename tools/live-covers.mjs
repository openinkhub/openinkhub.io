/**
 * Give the imported (content_source "live") blog posts the same blue cover cards as the generated posts.
 *
 *   node tools/live-covers.mjs      (then npm test)
 *
 * Writes static/images/articles/<slug>.svg, points featured_image at it and swaps the post's old lead photo in the
 * body for the cover (as a <figure>, which the post template uses as the hero image). Other body images are kept.
 * og:image stays a raster file, because social networks do not show SVG previews.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeCover, coverFigure } from "./covers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = path.join(ROOT, "content", "pages");
let n = 0;
for (const f of fs.readdirSync(PAGES)) {
  const file = path.join(PAGES, f);
  const rec = JSON.parse(fs.readFileSync(file, "utf8"));
  if (rec.type !== "post" || rec.content_source !== "live") continue;
  const slug = rec.path.replace(/^\/|\/$/g, "");
  const cat = (rec.categories || []).find((c) => c.name !== "Blogs") || { name: "Blog" };
  const old = rec.featured_image?.src || "";
  const img = makeCover({ dir: "articles", slug, title: rec.title, label: cat.name });
  let html = rec.content_html || "";
  if (!html.includes(img.src)) {
    // the lead photo is the featured image (or a resized copy of it: name-1024x559.webp)
    const base = old.split("/").pop().replace(/\.\w+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = base ? new RegExp(`(?:<figure>\\s*)?<img\\b[^>]*src="[^"]*/${base}(?:-\\d+x\\d+)?\\.\\w+"[^>]*>(?:\\s*</figure>)?`) : null;
    if (re && re.test(html)) html = html.replace(re, coverFigure(img));
    else html = html.replace(/(<\/h1>)/, `$1\n${coverFigure(img)}`);
  }
  rec.featured_image = img;
  rec.content_html = html;
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n");
  n++;
}
console.log(`live-covers: ${n} post(s) updated`);
