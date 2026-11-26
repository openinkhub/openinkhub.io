/**
 * Publish dates for the blog: one article per day within each group, starting 13 July 2026, no date repeated inside
 * a group. Groups: SEO city guides, Website Development (posts + guides), WhatsApp Automation (posts + guides) and
 * all other blog posts. Order inside a group follows the current publish order (oldest first, then brief number).
 *
 *   node tools/set-dates.mjs      (then npm test)
 *
 * Updates date, modified (never earlier than the new date) and the dates in the head meta and JSON-LD.
 * Re-running gives the same result. Generators keep an existing page's date, so these dates stay.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = path.join(ROOT, "content", "pages");
const START = Date.UTC(2026, 6, 13); // 13 July 2026
const TIME = "T10:00:00", TZ = "+05:30";
const HUB = "/category/best-seo-content-agency/";
const GROUPS = { "/category/seo-agency-by-city/": "city", "/category/website-development/": "web", "/category/whatsapp-automation/": "whatsapp" };

const recs = fs.readdirSync(PAGES).filter((f) => f.endsWith(".json")).map((f) => ({ f, j: JSON.parse(fs.readFileSync(path.join(PAGES, f), "utf8")) }))
  .filter(({ j }) => ["post", "guide"].includes(j.type) && !j.draft && j.status === 200);
const groups = {};
for (const r of recs) {
  const cat = (r.j.categories || []).find((c) => c.path !== HUB);
  (groups[GROUPS[cat?.path] || "other"] ||= []).push(r);
}
const day = (i) => new Date(START + i * 86400000).toISOString().slice(0, 10) + TIME;
const toUtc = (local) => new Date(local + TZ).toISOString().replace(/\.000Z$/, "+00:00");

function walk(o, D, M) {
  if (Array.isArray(o)) return o.forEach((x) => walk(x, D, M));
  if (!o || typeof o !== "object") return;
  if (o.attr === "property" && /^(article:published_time|og:publish_date)$/.test(o.key)) o.content = D + TZ;
  if (o.attr === "property" && /^(article:modified_time|og:updated_time)$/.test(o.key)) o.content = M + TZ;
  for (const [k, v] of Object.entries(o)) {
    if (k === "datePublished" && typeof v === "string") o[k] = v.endsWith("+00:00") ? toUtc(D) : D + TZ;
    else if (k === "dateModified" && typeof v === "string") o[k] = v.endsWith("+00:00") ? toUtc(M) : M + TZ;
    else if (typeof v === "object") walk(v, D, M);
  }
}

const report = [];
for (const [g, list] of Object.entries(groups)) {
  list.sort((a, b) => (a.j.date || "").localeCompare(b.j.date || "") || (a.j.brief_id || 0) - (b.j.brief_id || 0) || a.j.path.localeCompare(b.j.path));
  list.forEach((r, i) => {
    const D = day(i);
    const M = (r.j.modified || "") > D ? r.j.modified.slice(0, 19) : D;
    const before = JSON.stringify(r.j);
    r.j.date = D; r.j.modified = M;
    walk(r.j.head, D, M);
    if (JSON.stringify(r.j) !== before) fs.writeFileSync(path.join(PAGES, r.f), JSON.stringify(r.j, null, 2) + "\n");
  });
  report.push(`${g}: ${list.length} (${day(0).slice(0, 10)} to ${day(list.length - 1).slice(0, 10)})`);
}
console.log("set-dates: " + report.join(" · "));
