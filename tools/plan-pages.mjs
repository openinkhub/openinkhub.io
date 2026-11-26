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
const ready = (o) => !!String(o.description || "").trim() && (o.includes || []).length && fs.existsSync(path.join(ROOT, "static", ...o.brochure.split("/").filter(Boolean)));
const lk = (o, t) => ready(o) ? `<a href="/${o.slug}/">${t}</a>` : t;
const skipped = [];
// The lowest plan lists every item in full. A higher plan lists in full only what it adds or changes
// against the plan below it, then names the carried-over items by title (so the pages stay unique).
const sig = (i) => `${i.title}|${i.text}`;
function includesHtml(p) {
  const idx = D.plans.indexOf(p), prev = D.plans[idx - 1];
  if (!prev || !(prev.includes || []).length || !p.includes[0].group) {
    return p.includes[0] && p.includes[0].group ? p.includes.map((g) => `<h3>${E(g.group)}</h3>\n<ul>${li(g.items)}</ul>`).join("\n") : `<ul>${li(p.includes)}</ul>`;
  }
  const had = new Set(prev.includes.flatMap((g) => g.items.map(sig)));
  const added = p.includes.flatMap((g) => g.items.filter((i) => !had.has(sig(i))));
  return `<h3>What ${E(p.name)} adds to the ${lk(prev, `${E(prev.name)} plan`)}</h3>
<ul>${li(added)}</ul>`;
}
function keptHtml(p) {
  const idx = D.plans.indexOf(p), prev = D.plans[idx - 1];
  if (!prev || !(prev.includes || []).length || !p.includes[0].group) return "";
  const had = new Set(prev.includes.flatMap((g) => g.items.map(sig)));
  const kept = p.includes.map((g) => ({ group: g.group, items: g.items.filter((i) => had.has(sig(i))) })).filter((g) => g.items.length);
  return `<h2>Also included in the ${E(p.name)} plan, as in ${E(prev.name)}</h2>
<ul>${kept.map((g) => `<li><strong>${E(g.group)}</strong>: ${g.items.map((i) => E(i.title)).join("; ")}.</li>`).join("")}</ul>`;
}
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
${includesHtml(p)}
<h2>How the ${E(p.name)} plan works</h2>
<ol>${li(p.process)}</ol>
<p>${others.some(ready) ? `Need more? See the ${others.filter(ready).map((o) => lk(o, E(o.name))).join(" and ")} plan${others.filter(ready).length > 1 ? "s" : ""}, or read` : "Read"} about our <a href="/best-seo-services-in-india/">SEO services in India</a>.</p>`;
  // shared by every plan page: rendered outside <!--seo:content--> by build.mjs, so it does not count as duplicate content
  const shared = `${keptHtml(p)}
${(p.targets || []).length ? `<h2>${E(p.name)} plan targets</h2>
<table><thead><tr><th>Target</th><th>Goal</th><th>What it means</th></tr></thead><tbody>${p.targets.map((t) => `<tr><td>${E(t.label)}</td><td><strong>${E(t.value)}</strong></td><td>${E(t.text)}</td></tr>`).join("")}</tbody></table>
${p.target_note ? `<p>${E(p.target_note)}</p>` : ""}` : ""}
${(p.extras || []).length ? `<h2>Extra services (charged separately)</h2>\n<p>These are not part of the ${E(p.name)} plan price and can be added on extra charges:</p>\n<ul>${li(p.extras)}</ul>` : ""}
<h2>What to do before you start</h2>
<ol>${li(p.guide)}</ol>
<h2>Compare AI SEO plans</h2>
<table><thead><tr><th>Plan</th><th>Starting price</th></tr></thead><tbody>${D.plans.map((o) => `<tr><td>${o.key === p.key ? `${E(o.name)} (this plan)` : lk(o, `${E(o.name)} AI SEO plan`)}</td><td>From ${E(o.price)}* ${E(o.period)}</td></tr>`).join("")}</tbody></table>
<p><em>${E(D.terms)}</em></p>`;
  const faqs = (p.faqs || []).map(([q, a]) => ({ q, a: `<p>${E(a)}</p>` }));
  const title = `${p.title} | openink Hub`.length <= 60 ? `${p.title} | openink Hub` : p.title;
  const rec = {
    url, path: rel, status: 200, type: "page", plan: p.key, sitemap: "pages",
    title: `${p.name} AI SEO plan`, h1: p.h1, date: now, modified: now, author: "Openink Hub",
    excerpt: p.description, keyphrase_override: p.keyword, keyphrase_secondary_override: [`${p.name.toLowerCase()} ai seo plan`],
    categories: [], tags: [], faqs, featured_image: null, content_html: body, plan_shared_html: shared, content_source: "ai-seo-plans",
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
