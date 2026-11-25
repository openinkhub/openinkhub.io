/**
 * Build the three AI SEO plan pages (Basic, Standard, Premium) from content/ai-seo-plans.json
 * into content/pages/<slug>.json.
 *
 *   node tools/plan-pages.mjs      (then npm test)
 *
 * A plan is skipped (no page written) until its brochure content is filled in: description, intro,
 * includes, guide and process must all be present, and its brochure PDF must exist in static/brochures/.
 * The page itself shows only pricing details; build.mjs adds the brochure form (#brochure) and plan links.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "ai-seo-plans.json"), "utf8"));
const PAGES = path.join(ROOT, "content", "pages");
const BASE = "https://openinkhub.io";
const IMAGE = `${BASE}/wp-content/uploads/2026/07/business-process-optimization-1.webp`;
const now = new Date().toISOString().slice(0, 19);
const E = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const li = (a) => a.map((x) => typeof x === "string" ? `<li>${E(x)}</li>` : `<li><strong>${E(x.title)}</strong>: ${E(x.text)}</li>`).join("");

let made = 0;
const skipped = [];
for (const p of D.plans) {
  const need = ["description", "intro"].filter((k) => !String(p[k] || "").trim()).concat(["includes", "guide", "process"].filter((k) => !(p[k] || []).length));
  if (!fs.existsSync(path.join(ROOT, "static", ...p.brochure.split("/").filter(Boolean)))) need.push("brochure PDF");
  if (need.length) { skipped.push(`${p.name} (${need.join(", ")})`); continue; }
  const url = `${BASE}/${p.slug}/`, rel = `/${p.slug}/`;
  const others = D.plans.filter((o) => o.key !== p.key);
  const body = `<h1>${E(p.h1)}</h1>
<p>${E(p.intro)}</p>
<h2>${E(p.name)} AI SEO plan price</h2>
<table><thead><tr><th>Plan</th><th>Starting price</th>${p.best_for ? "<th>Best for</th>" : ""}</tr></thead>
<tbody><tr><td>${E(p.name)} AI SEO</td><td>From ${E(p.price)}* ${E(p.period)}</td>${p.best_for ? `<td>${E(p.best_for)}</td>` : ""}</tr></tbody></table>
<h2>What the ${E(p.name)} AI SEO plan includes</h2>
<ul>${li(p.includes)}</ul>
<h2>What to do before you start</h2>
<ol>${li(p.guide)}</ol>
<h2>How the ${E(p.name)} plan works</h2>
<ol>${li(p.process)}</ol>
<h2>Compare AI SEO plans</h2>
<table><thead><tr><th>Plan</th><th>Starting price</th></tr></thead><tbody>${D.plans.map((o) => `<tr><td>${o.key === p.key ? `${E(o.name)} (this plan)` : `<a href="/${o.slug}/">${E(o.name)} AI SEO plan</a>`}</td><td>From ${E(o.price)}* ${E(o.period)}</td></tr>`).join("")}</tbody></table>
<p>Need more or less? See the <a href="/${others[0].slug}/">${E(others[0].name)}</a> and <a href="/${others[1].slug}/">${E(others[1].name)}</a> plans, or read about our <a href="/best-seo-services-in-india/">SEO services in India</a>.</p>
<p><em>${E(D.terms)}</em></p>`;
  const faqs = (p.faqs || []).map(([q, a]) => ({ q, a: `<p>${E(a)}</p>` }));
  const title = `${p.title} | openink Hub`.length <= 60 ? `${p.title} | openink Hub` : p.title;
  const rec = {
    url, path: rel, status: 200, type: "page", plan: p.key, sitemap: "pages",
    title: `${p.name} AI SEO plan`, h1: p.h1, date: now, modified: now, author: "Openink Hub",
    excerpt: p.description, keyphrase_override: p.keyword, keyphrase_secondary_override: [`${p.name.toLowerCase()} ai seo plan`],
    categories: [], tags: [], faqs, featured_image: null, content_html: body, content_source: "ai-seo-plans",
    head: {
      title, lang: "en-US", jsonld: [], links: [{ rel: "canonical", href: url }],
      meta: [
        { attr: "name", key: "robots", content: "index, follow, max-image-preview:large" },
        { attr: "name", key: "description", content: p.description },
        { attr: "property", key: "og:title", content: p.title },
        { attr: "property", key: "og:description", content: p.description },
        { attr: "property", key: "og:type", content: "website" },
        { attr: "property", key: "og:url", content: url },
        { attr: "property", key: "og:image", content: IMAGE },
        { attr: "name", key: "twitter:card", content: "summary_large_image" },
      ],
    },
  };
  const prev = path.join(PAGES, `${p.slug}.json`);
  if (fs.existsSync(prev)) { const o = JSON.parse(fs.readFileSync(prev, "utf8")); if (!o.plan) throw new Error(`${rel} already exists as a non-plan page`); rec.date = o.date; }
  rec.head.jsonld.push({ "@context": "https://schema.org", "@graph": [
    { "@type": "Service", "@id": `${url}#service`, name: `${p.name} AI SEO plan`, serviceType: "AI SEO", url, description: p.description,
      provider: { "@id": `${BASE}/#organization` }, areaServed: "IN",
      offers: { "@type": "Offer", priceCurrency: "INR", price: p.price.replace(/\D/g, ""), url, priceSpecification: { "@type": "UnitPriceSpecification", priceCurrency: "INR", price: p.price.replace(/\D/g, ""), unitCode: "MON", valueAddedTaxIncluded: false } } },
    { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "SEO services", item: `${BASE}/best-seo-services-in-india/` },
      { "@type": "ListItem", position: 3, name: `${p.name} AI SEO plan`, item: url }] },
  ] });
  fs.writeFileSync(prev, JSON.stringify(rec, null, 2) + "\n");
  made++;
}
console.log(`plan pages: ${made} written${skipped.length ? `; waiting for brochure content: ${skipped.join("; ")}` : ""}`);
