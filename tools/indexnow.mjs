/**
 * Tell IndexNow search engines (Bing, Yandex, Yep, Seznam, Naver...) which URLs are new or changed.
 * Sends to the shared api.indexnow.org endpoint and to Yep's own endpoint (Yep = Ahrefs' search engine).
 * Run it AFTER the deploy is live, because they fetch the key file to check the site is ours.
 *
 *   node tools/indexnow.mjs                 pages changed in the last commit (content/pages/*.json)
 *   node tools/indexnow.mjs --since <ref>   pages changed since a git ref, e.g. --since HEAD~5
 *   node tools/indexnow.mjs --all           every URL in the sitemaps (dist/sitemap-*.xml, run npm run build first)
 *   node tools/indexnow.mjs --dry ...       list the URLs, send nothing
 *   node tools/indexnow.mjs <url> <url>     these URLs only
 *
 * The key is public by design: it lives at https://openinkhub.io/<key>.txt (static/<key>.txt).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "53a744e9a5304fffa5c77c9e4d7e7c98";
const HOST = "openinkhub.io";
const SITE = `https://${HOST}`;
const KEY_URL = `${SITE}/${KEY}.txt`;
const ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://indexnow.yep.com/indexnow"];

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const explicit = args.filter((a) => /^https?:\/\//.test(a));

function pagesChangedSince(ref) {
  const out = execFileSync("git", ["diff", "--name-only", "--diff-filter=AM", ref, "HEAD", "--", "content/pages"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((f) => f.endsWith(".json")).map((f) => {
    try { const j = JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); return j.status === 200 && !j.draft ? j.url : null; } catch { return null; }
  }).filter(Boolean);
}

function sitemapUrls() {
  const dist = path.join(ROOT, "dist");
  return fs.readdirSync(dist).filter((f) => /^sitemap-.*\.xml$/.test(f))
    .flatMap((f) => [...fs.readFileSync(path.join(dist, f), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}

let urls = explicit.length ? explicit : args.includes("--all") ? sitemapUrls() : pagesChangedSince(flag("--since") || "HEAD~1");
urls = [...new Set(urls)].filter((u) => u.startsWith(SITE + "/"));
if (!urls.length) { console.log("indexnow: no URLs to submit"); process.exit(0); }
console.log(`indexnow: ${urls.length} URL(s)`);
if (dry) { console.log(urls.join("\n")); process.exit(0); }

// the engines reject the submission if the key file is not live yet
const live = await fetch(KEY_URL).then(async (r) => r.ok && (await r.text()).trim() === KEY).catch(() => false);
if (!live) { console.error(`indexnow: ${KEY_URL} is not live (or has the wrong content) — deploy first`); process.exit(1); }

for (const ENDPOINT of ENDPOINTS) for (let i = 0; i < urls.length; i += 10000) {
  const urlList = urls.slice(i, i + 10000);
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_URL, urlList }),
  });
  // 200 = accepted, 202 = accepted (key check pending); 4xx = problem with key, host or URLs
  console.log(`indexnow: ${new URL(ENDPOINT).host} HTTP ${r.status} for ${urlList.length} URL(s)${r.ok ? "" : " — " + (await r.text()).slice(0, 300)}`);
  if (!r.ok) process.exitCode = 1;
}
