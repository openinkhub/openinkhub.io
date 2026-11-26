/**
 * Publish stand-alone articles from content/articles/extra-posts/<slug>.html as blog posts.
 *
 *   node tools/extra-posts.mjs      (then npm test)
 *
 * Each article's metadata lives in POSTS below; the body (with its <h1> and a plain FAQ section) in the HTML file.
 * Output: content/pages/<slug>.json (type "post"), FAQs parsed from the "Frequently asked questions" section.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeCover } from "./covers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content", "articles", "extra-posts");
const PAGES = path.join(ROOT, "content", "pages");
const BASE = "https://openinkhub.io";
const BLOG = { name: "Blogs", path: "/category/best-seo-content-agency/" };
const cat = (slug, name) => ({ name, path: `/category/${slug}/` });

const POSTS = [
  { slug: "best-rated-ats-for-small-business-scaling", date: "2026-11-14T19:00:00",
    title: "Best-Rated ATS for Small Business Scaling: How to Pick",
    desc: "The best-rated ATS for small business scaling: how to read ATS ratings, top-rated tools to shortlist, features for growth and a 6-step way to choose.",
    keyphrase: "best rated ats for small business scaling", secondary: ["top rated ats", "ats ratings", "ats for scaling"],
    categories: [cat("articles", "Articles"), BLOG], tags: [] },
  { slug: "best-ats-software-for-growing-small-businesses", date: "2026-11-14T19:05:00",
    title: "Best ATS Software for Growing Small Businesses",
    desc: "The best ATS software for growing small businesses, by growth stage: features and tools to look at, a 6-step choice guide and a switching checklist.",
    keyphrase: "best ats software for growing small businesses", secondary: ["ats by growth stage", "applicant tracking", "switching ats"],
    categories: [cat("articles", "Articles"), BLOG], tags: [] },
  { slug: "geo-framework", date: "2026-11-14T19:10:00",
    title: "GEO Framework: 6 Steps to Get Cited by AI Answers",
    desc: "A 6-step GEO framework to get your brand cited by ChatGPT, Gemini and Perplexity: audit, entity, answers, evidence, structure and tracking.",
    keyphrase: "geo framework", secondary: ["generative engine optimization", "ai citations", "ai visibility"],
    categories: [cat("geo", "GEO"), cat("aio", "AIO"), BLOG], tags: [] },
  { slug: "best-answer-engine-optimization-solutions-for-ai-tech", date: "2026-11-14T19:15:00",
    title: "Best Answer Engine Optimization Solutions for AI Tech",
    desc: "The best answer engine optimization solutions for AI tech companies: AEO tools and partners compared, what to look for and how to choose.",
    keyphrase: "best answer engine optimization solutions for ai tech", secondary: ["aeo tools", "aeo for saas", "featured snippets"],
    categories: [cat("aeo", "AEO"), BLOG], tags: [] }
];

const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const template = JSON.parse(fs.readFileSync(path.join(PAGES, "website-development-process.json"), "utf8"));

for (const p of POSTS) {
  const file = path.join(SRC, `${p.slug}.html`);
  let html = fs.readFileSync(file, "utf8").trim();
  const h1 = strip((/<h1>([\s\S]*?)<\/h1>/.exec(html) || [])[1] || p.title);
  const url = `${BASE}/${p.slug}/`;
  const cover = makeCover({ dir: "articles", slug: p.slug, title: p.title, label: p.categories[0].name });
  html = html.replace(/(<\/h1>)/, `$1\n<figure><img src="${cover.src}" alt="${cover.alt}" width="1200" height="630"></figure>`);
  // FAQs from the plain FAQ section (h3 question + p answer)
  const faqPart = html.split(/<h2>Frequently asked questions<\/h2>/i)[1] || "";
  const faqs = [...faqPart.matchAll(/<h3>([\s\S]*?)<\/h3>\s*(<p>[\s\S]*?<\/p>)/g)].map((m) => ({ q: strip(m[1]), a: m[2] }));
  const firstP = strip((/<p>([\s\S]*?)<\/p>/.exec(html) || [])[1] || "");
  const head = JSON.parse(JSON.stringify(template.head));
  head.title = p.title;
  head.meta = head.meta.filter((m) => /^(robots|googlebot|bingbot)$/.test(m.key));
  head.meta.push({ attr: "name", key: "description", content: p.desc }, { attr: "property", key: "og:url", content: url },
    { attr: "property", key: "og:type", content: "article" }, { attr: "name", key: "twitter:card", content: "summary_large_image" });
  head.links = [{ rel: "canonical", href: url, hreflang: null, type: null, sizes: null }];
  head.jsonld = [];
  const rec = {
    url, path: `/${p.slug}/`, status: 200, type: "post",
    title: p.title, h1, date: p.date, modified: p.date, author: template.author,
    excerpt: firstP.length > 200 ? firstP.slice(0, firstP.lastIndexOf(" ", 197)) + "…" : firstP,
    keyphrase_override: p.keyphrase, keyphrase_secondary_override: p.secondary,
    categories: p.categories, tags: p.tags, faqs,
    featured_image: cover, content_source: "extra-posts", head, content_html: html
  };
  fs.writeFileSync(path.join(PAGES, `${p.slug}.json`), JSON.stringify(rec, null, 2) + "\n");
  console.log(`${rec.path}  faqs ${faqs.length}  words ${strip(html).split(" ").length}`);
}
