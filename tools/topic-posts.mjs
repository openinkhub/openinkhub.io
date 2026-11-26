/**
 * Publish the AI search topic plan (SEO, AEO, GEO, AIO articles) as blog posts.
 *
 *   node tools/topic-posts.mjs      (then node tools/set-dates.mjs and npm test)
 *
 * Source:  content/articles/ai-search-topics.json   (one entry per article; published when it has "status": "published")
 *          content/articles/ai-search-posts/<slug>.html   (article body, without H1 and FAQ)
 * Output:  content/pages/<slug>.json   type "post", in its SEO / AEO / GEO / AIO category and the Blogs hub
 *
 * Rules: slug = target keyword, title ends in the year (no site-name suffix then), cover image and alt text come from
 * the build (blog cover rule in build.mjs), the service link comes from rules.json service_links, the publish date
 * from tools/set-dates.mjs. An existing page keeps its date; `modified` only changes when the page changes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content", "articles", "ai-search-topics.json");
const BODIES = path.join(ROOT, "content", "articles", "ai-search-posts");
const PAGES = path.join(ROOT, "content", "pages");
const BASE = "https://openinkhub.io";
const IMAGE = `${BASE}/wp-content/uploads/2026/07/business-process-optimization-1.webp`; // og:image (social sites do not show SVG)
const BLOGS = { name: "Blogs", path: "/category/best-seo-content-agency/" };
const CATS = {
  SEO: { name: "SEO", path: "/category/seo-services/" },
  AEO: { name: "AEO", path: "/category/aeo/" },
  GEO: { name: "GEO", path: "/category/geo/" },
  AIO: { name: "AIO", path: "/category/aio/" },
};
const AUTHOR = "Hiten Neotia";
const now = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 19); // India time, matches the +05:30 suffix
const E = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
let made = 0;
const warn = [];
for (const t of data.topics.filter((x) => x.status === "published")) {
  const cat = CATS[t.category];
  if (!cat) throw new Error(`topic ${t.id}: category must be one of ${Object.keys(CATS).join(", ")}`);
  if (!/\b20\d\d$/.test(t.title)) throw new Error(`topic ${t.id}: title must end with the year`);
  const bodyFile = path.join(BODIES, `${t.slug}.html`);
  if (!fs.existsSync(bodyFile)) throw new Error(`topic ${t.id}: missing ${path.relative(ROOT, bodyFile)}`);
  const p = `/${t.slug}/`, url = BASE + p, target = path.join(PAGES, `${t.slug}.json`);
  const prev = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : null;
  if (prev && prev.content_source !== "topic-posts") throw new Error(`${p} already exists as a different page`);
  const date = prev?.date || now;
  const faqs = t.faqs.map(([q, a]) => ({ q, a: `<p>${E(a)}</p>` }));
  const build = (mod) => ({
    url, path: p, status: 200, type: "post", topic_id: t.id, pillar: t.pillar, intent: t.intent, format: t.format,
    title: t.title, h1: t.h1, date, modified: mod, author: AUTHOR, excerpt: t.description,
    keyphrase_override: t.keyword, keyphrase_secondary_override: t.secondary,
    categories: [cat, BLOGS], tags: prev?.tags || [], faqs, content_source: "topic-posts",
    content_html: `<h1>${E(t.h1)}</h1>\n` + fs.readFileSync(bodyFile, "utf8").trim() + "\n" +
      `<h2>Frequently asked questions</h2>${t.faqs.map(([q, a]) => `<h3>${E(q)}</h3><p>${E(a)}</p>`).join("")}`,
    head: {
      title: t.title, lang: "en-US",
      links: [{ rel: "canonical", href: url }],
      meta: [
        { attr: "name", key: "robots", content: "index, follow, max-image-preview:large" },
        { attr: "name", key: "description", content: t.description },
        { attr: "property", key: "og:title", content: t.title },
        { attr: "property", key: "og:description", content: t.description },
        { attr: "property", key: "og:type", content: "article" },
        { attr: "property", key: "og:url", content: url },
        { attr: "property", key: "og:image", content: IMAGE },
        { attr: "property", key: "article:published_time", content: date + "+05:30" },
        { attr: "property", key: "article:modified_time", content: mod + "+05:30" },
        { attr: "property", key: "article:section", content: cat.name },
        { attr: "name", key: "twitter:card", content: "summary_large_image" },
      ],
      jsonld: [{ "@context": "https://schema.org", "@graph": [
        { "@type": "BlogPosting", "@id": `${url}#article`, headline: t.title, description: t.description, url, image: IMAGE,
          datePublished: date + "+05:30", dateModified: mod + "+05:30", keywords: [t.keyword, ...t.secondary].join(", "),
          articleSection: cat.name, author: { "@type": "Person", name: AUTHOR }, publisher: { "@id": `${BASE}/#organization` } },
        { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
          { "@type": "ListItem", position: 2, name: cat.name, item: BASE + cat.path },
          { "@type": "ListItem", position: 3, name: t.title, item: url }] },
      ] }],
    },
  });
  let rec = build(prev?.modified || now);
  // keep the dates set by set-dates.mjs when nothing else changed
  if (prev) { const a = { ...rec, modified: 0, head: 0 }, b = { ...prev, modified: 0, head: 0 }; if (JSON.stringify(a) !== JSON.stringify(b)) rec = build(now); else rec = prev; }
  fs.writeFileSync(target, JSON.stringify(rec, null, 2) + "\n");
  made++;
  if (t.title.length > 60 || t.description.length > 160 || t.description.length < 70) warn.push(t.id);
}
console.log(`topic-posts: ${made} article(s) published`, warn.length ? `· length warnings: ${warn.join(",")}` : "");
