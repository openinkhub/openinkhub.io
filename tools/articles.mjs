/**
 * Generate guide pages from content/articles/*.json into content/pages/<slug>.json.
 *
 *   npm run articles      (then npm test)
 *
 * status "draft"      -> page is built but noindex,nofollow; excluded from sitemaps, llms.txt and the audit;
 *                        not linked from the hub (card shows "Coming soon")
 * status "published"  -> indexable page, in sitemaps and llms.txt, audited, linked from the hub
 *
 * Content: body_html (HTML; plain paragraphs are fine) and optional faqs [[question, answer], ...].
 * Re-running is safe: the original publish date is kept once a page has been published.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content", "articles");
const PAGES = path.join(ROOT, "content", "pages");
const BASE = "https://openinkhub.io";
const IMAGE = `${BASE}/wp-content/uploads/2026/07/business-process-optimization-1.webp`;
const now = new Date().toISOString().slice(0, 19);
const E = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let made = 0, published = 0;
for (const file of fs.readdirSync(SRC).filter((n) => n.endsWith(".json"))) {
  const set = JSON.parse(fs.readFileSync(path.join(SRC, file), "utf8"));
  if (!Array.isArray(set.items)) continue; // e.g. the briefs file
  for (const a of set.items) {
    // body text may live in content/articles/<set>/<slug>.html instead of body_html
    const htmlFile = path.join(SRC, file.replace(/\.json$/, ""), `${a.slug}.html`);
    if (!String(a.body_html || "").trim() && fs.existsSync(htmlFile)) a.body_html = fs.readFileSync(htmlFile, "utf8");
    const p = `/${a.slug}/`, url = BASE + p;
    const target = path.join(PAGES, `${a.slug}.json`);
    const prev = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : null;
    if (prev && !prev.guide) throw new Error(`${p} already exists as a non-guide page`);
    const isPub = a.status === "published";
    if (isPub && !String(a.body_html || "").trim()) throw new Error(`${p}: status is published but body_html is empty`);
    const date = prev?.date && prev.status_published ? prev.date : now;
    const faqs = (a.faqs || []).map(([q, ans]) => ({ q, a: /^\s*</.test(ans) ? ans : `<p>${E(ans)}</p>` }));
    const draftBody = `<p><strong>This guide is being written.</strong> It will cover:</p><ul>${a.outline.map((o) => `<li>${E(o)}</li>`).join("")}</ul>` +
      `<p>In the meantime, see our <a href="${set.hub}">${E(set.hub_label || "website design and development services")}</a>.</p>`;
    const body = isPub ? a.body_html + (faqs.length ? `<h2>Frequently asked questions</h2>${faqs.map((f) => `<h3>${E(f.q)}</h3>${f.a}`).join("")}` : "") : draftBody;
    const rec = {
      url, path: p, status: 200, type: "guide", guide: true, draft: !isPub, status_published: isPub,
      hub: set.hub, ...(set.flag ? { [set.flag]: true } : {}), card_title: a.card_title, card_text: a.card_text, n: a.n,
      title: a.title, h1: a.h1, date, modified: now, author: set.author || "Openink Hub",
      excerpt: a.description, keyphrase_override: a.keyphrase, keyphrase_secondary_override: a.secondary || [],
      // keep categories added later by hand; otherwise use the set default
      categories: prev?.categories?.length ? prev.categories : (set.categories || []), tags: prev?.tags || [], faqs, featured_image: null,
      content_html: `<h1>${E(a.h1)}</h1>\n${body}`,
      content_source: "articles",
      head: {
        title: `${a.title} | openink Hub`.length <= 60 ? `${a.title} | openink Hub` : a.title, lang: "en-US", jsonld: [],
        links: [{ rel: "canonical", href: url }],
        meta: [
          { attr: "name", key: "robots", content: isPub ? "index, follow, max-image-preview:large" : "noindex, nofollow" },
          { attr: "name", key: "description", content: a.description },
          { attr: "property", key: "og:title", content: a.title },
          { attr: "property", key: "og:description", content: a.description },
          { attr: "property", key: "og:type", content: "article" },
          { attr: "property", key: "og:url", content: url },
          { attr: "property", key: "og:image", content: IMAGE },
          { attr: "name", key: "twitter:card", content: "summary_large_image" },
        ],
      },
    };
    // Article + breadcrumb (hub -> guide); Organization/FAQ are added by the build's auto-fixes
    rec.head.jsonld.push({ "@context": "https://schema.org", "@graph": [
      { "@type": "Article", "@id": `${url}#article`, headline: a.title, description: a.description, url,
        datePublished: date + "+05:30", dateModified: now + "+05:30", author: { "@type": "Person", name: rec.author },
        publisher: { "@id": `${BASE}/#organization` }, image: IMAGE },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: set.hub_name || "Website Design & Development", item: BASE + set.hub },
        { "@type": "ListItem", position: 3, name: a.card_title, item: url }] },
    ] });
    // unchanged page: keep its modified date, so re-running does not touch every file
    if (prev && prev.content_html === rec.content_html && prev.title === rec.title && prev.excerpt === rec.excerpt && prev.draft === rec.draft) {
      rec.modified = prev.modified;
      rec.head.jsonld[0]["@graph"][0].dateModified = prev.modified + "+05:30";
    }
    fs.writeFileSync(target, JSON.stringify(rec, null, 2) + "\n");
    made++; if (isPub) published++;
  }
}
console.log(`articles: ${made} guide pages written (${published} published, ${made - published} drafts)`);
