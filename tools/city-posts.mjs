/**
 * Compose the 100 "SEO by city" blog posts from per-city source files.
 *
 * Source:  content/city-posts/*.json   arrays of city entries (written by hand, one entry per URL)
 * Target:  content/pages/<file>.json    content_html, title/H1, SEO head tags, JSON-LD, FAQs
 *
 * URLs, canonical, publish date and author are never changed - only the content and head copy.
 *
 *   npm run city-posts     (then npm run build)
 *
 * Entry fields:
 *   file      page file / URL slug, e.g. "best-seo-agency-in-pune"
 *   city, state
 *   title     <title> / og / twitter title (<= ~62 chars)
 *   h1        on-page headline
 *   desc      meta description (<= ~158 chars)
 *   quick     40-60 word direct answer (AEO snippet)
 *   intro     [paragraph, paragraph]
 *   market    paragraph on the local economy and how people search
 *   sectors   [[sector, what search looks like for it here], x3]
 *   areas     business districts / localities
 *   seo       paragraph + tactics [x3]
 *   aeo       paragraph + questions [x3] people here actually ask
 *   geo, aio  paragraphs
 *   example   a worked local scenario
 *   faqs      [[question, answer], x3]
 *   near      nearby city slugs (link to /best-seo-agency-in-<slug>/)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeCover, coverFigure } from "./covers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content", "city-posts");
const PAGES = path.join(ROOT, "content", "pages");
const BASE = "https://openinkhub.io";
const CATEGORY = { name: "SEO by City", path: "/category/seo-agency-by-city/" };
const TODAY = new Date().toISOString().slice(0, 10) + "T09:00:00+05:30";

const E = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** allow a little inline markup in source text: **bold** */
const T = (s) => E(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (key, arr) => arr[hash(key) % arr.length];

// Section headings vary per city so the 100 posts don't share an identical outline.
const H = {
  market: [(c) => `How ${c} searches for businesses`, (c) => `${c}'s local search landscape`, (c) => `What makes search in ${c} different`,
    (c) => `Reading the ${c} market before optimizing`, (c) => `Who is searching in ${c} — and for what`],
  seo: [(c) => `SEO priorities for ${c} businesses`, (c) => `Ranking on Google in ${c}`, (c) => `Search engine optimization that fits ${c}`,
    (c) => `Getting the fundamentals right in ${c}`, (c) => `Where ${c} websites usually lose rankings`],
  aeo: [(c) => `Answer engine optimization: being the answer in ${c}`, (c) => `AEO for ${c}: questions worth owning`,
    (c) => `Winning featured snippets and voice answers in ${c}`, (c) => `The questions ${c} customers ask first`],
  geo: [(c) => `Generative engine optimization for ${c} brands`, (c) => `Getting cited by ChatGPT, Gemini and Perplexity in ${c}`,
    (c) => `GEO: how AI assistants describe ${c} businesses`, (c) => `Making AI answers mention you in ${c}`],
  aio: [(c) => `AI optimization (AIO) and automation in ${c}`, (c) => `AIO: making your ${c} brand machine-readable`,
    (c) => `Where AI optimization pays off in ${c}`, (c) => `Using AI to scale search work in ${c}`],
  example: [(c) => `A worked example from ${c}`, (c) => `What this looks like for a ${c} business`, (c) => `Putting it together in ${c}`,
    (c) => `A ${c} scenario, step by step`],
  areas: [(c) => `Areas we cover in and around ${c}`, (c) => `Serving businesses across ${c}`, (c) => `${c} neighbourhoods and nearby markets`],
  faq: [(c) => `${c} SEO, AEO, GEO and AIO — FAQs`, (c) => `Frequently asked questions about SEO in ${c}`, (c) => `Questions ${c} business owners ask us`],
};
const LINKS = {
  seo: [`For more detail, our <a href="/best-on-page-seo-services/">on-page and technical SEO process</a> covers each step.`,
    `Next, see how our <a href="/best-on-page-seo-services/">checklist-driven SEO service</a> handles these fixes.`,
    `In fact, this is the core of our <a href="/best-on-page-seo-services/">SEO service</a>.`,
    `In short, the full method is on our <a href="/best-on-page-seo-services/">SEO services page</a>.`,
    `As a result, we audit all of this in our <a href="/best-on-page-seo-services/">SEO engagements</a>.`],
  aeo: [`For more, read about our <a href="/best-answer-engine-optimization-services/">answer engine optimization</a> approach.`,
    `Next, read how we run <a href="/best-answer-engine-optimization-services/">AEO engagements</a>.`,
    `In fact, our <a href="/best-answer-engine-optimization-services/">AEO service</a> is built around exactly this.`,
    `In other words, <a href="/best-answer-engine-optimization-services/">answer engine optimization</a> turns questions like these into visibility.`,
    `So we map and answer questions like these in our <a href="/best-answer-engine-optimization-services/">AEO work</a>.`],
  geo: [`For more, learn about <a href="/generative-engine-optimization/">generative engine optimization</a>.`,
    `Next, our <a href="/generative-engine-optimization/">GEO service</a> explains the method.`,
    `In short, see the full <a href="/generative-engine-optimization/">GEO framework</a>.`,
    `In fact, that is what <a href="/generative-engine-optimization/">generative engine optimization</a> is for.`],
  aio: [`For more, explore <a href="/artificial-intelligence-optimization/">artificial intelligence optimization</a>.`,
    `Next, see how our <a href="/artificial-intelligence-optimization/">AIO work</a> fits together.`,
    `In addition, see details on our <a href="/artificial-intelligence-optimization/">AIO service</a>.`,
    `For more, read our guide to <a href="/artificial-intelligence-optimization/">AI optimization</a>.`],
};
// Opening line, areas line and CTA use the focus keyphrase "SEO agency in <city>" naturally (keyphrase + density checks).
const LEAD = [
  (c) => `Looking for an SEO agency in ${c}? This guide shows how local businesses can get found on Google, in answer boxes and in AI assistants.`,
  (c) => `Choosing an SEO agency in ${c} is easier when you know what local search really rewards. Here is how we approach it.`,
  (c) => `If you are comparing an SEO agency in ${c}, start with how your customers search. This guide explains it step by step.`,
  (c) => `A good SEO agency in ${c} should help you win on Google and in AI answers. Below, we explain how that works locally.`,
  (c) => `Hiring an SEO agency in ${c}? First, see how search, answer engines and AI tools shape local buying decisions.`,
];
const AREAS = [
  (c, a) => `As an SEO agency in ${c}, we also work with businesses in ${a}.`,
  (c, a) => `In practice, our work as an SEO agency in ${c} covers ${a}.`,
  (c, a) => `So we support clients of our SEO agency in ${c} across ${a}.`,
];
// Primary-source citations (authority signal), rotated per city
const CITE = {
  seo: [`In addition, Google's own <a href="https://developers.google.com/search/docs/fundamentals/seo-starter-guide" target="_blank" rel="noopener">SEO starter guide</a> sets out the same basics.`,
    `Also, Google explains how relevance, distance and prominence decide local results in its <a href="https://support.google.com/business/answer/7091" target="_blank" rel="noopener">local ranking guide</a>.`,
    `Speed also matters, as Google's <a href="https://developers.google.com/search/docs/appearance/core-web-vitals" target="_blank" rel="noopener">Core Web Vitals documentation</a> explains.`],
  aeo: [`In practice, marking up answers with <a href="https://schema.org/FAQPage" target="_blank" rel="noopener">FAQPage structured data</a> helps search engines read them.`,
    `In addition, Google's <a href="https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data" target="_blank" rel="noopener">structured data guide</a> shows how to label answers for search.`,
    `After that, clear, people-first answers are what Google's <a href="https://developers.google.com/search/docs/fundamentals/creating-helpful-content" target="_blank" rel="noopener">helpful content guidance</a> asks for.`],
};
// "Key steps" list: short, transition-led sentences built from each city's own data (readability + transitions)
const STEPS_H = [(c) => `Choosing an SEO agency in ${c}: key steps`, (c) => `Working with an SEO agency in ${c}: where to start`, (c) => `SEO agency in ${c}: a simple plan`, (c) => `Your first five SEO moves in ${c}`];
const STEP_GBP = ["After that, keep your Google Business Profile, photos and reviews up to date.",
  "After that, reply to reviews and post fresh photos on your Google Business Profile.",
  "After that, check that your name, address and phone match everywhere online."];
const STEP_TRACK = ["Finally, track calls, WhatsApp chats and form leads, not just rankings.",
  "Finally, measure enquiries and sales, not only traffic.",
  "Finally, review the results every month and fix the weakest page first."];
function steps(c, k) {
  const lc = (x) => x.charAt(0).toLowerCase() + x.slice(1);
  const sec = c.sectors.slice(0, 2).map(([n]) => lc(n));
  const q = c.questions[0].replace(/\*\*/g, "").trim();
  return [
    `First, focus on the searches that matter most here, such as ${sec.join(" and ")}.`,
    `Next, name the areas you serve, like ${c.areas[0]} and ${c.areas[1]}, on your service pages.`,
    `Then answer the questions people ask, for example: “${q}”`,
    pick(k("sgbp"), STEP_GBP),
    pick(k("strk"), STEP_TRACK),
  ];
}
const DEMO = `<a href="https://calendly.com/openinkhub/30min/">book a free 30-minute demo</a>`;
const CONTACT = (t) => `<a href="/contact-us/">${t}</a>`;
const CTA = [
  (c) => `Want a plan from an SEO agency in ${c}? ${CONTACT("Talk to the Openink Hub team")} or ${DEMO}.`,
  (c) => `Ready to work with an SEO agency in ${c}? ${CONTACT("Get in touch")}, or ${DEMO} with our team.`,
  (c) => `If you run a business in ${c} and need an SEO agency in ${c}, we'd be glad to review your search presence. ${CONTACT("Contact us")} or ${DEMO}.`,
  (c) => `Curious where your ${c} business stands in Google and AI answers? As an SEO agency in ${c}, we can tell you. ${CONTACT("Ask us for an audit")} or ${DEMO}.`,
  (c) => `Planning your next step with an SEO agency in ${c}? ${CONTACT("Message the Openink Hub team")}, or ${DEMO}.`,
];

function render(c, img) {
  const k = (s) => c.file + ":" + s;
  const h2 = (s) => `<h2>${E(pick(k(s), H[s])(c.city))}</h2>`;
  const near = (c.near || []).map((s) => {
    const f = path.join(PAGES, `best-seo-agency-in-${s}.json`);
    if (!fs.existsSync(f)) throw new Error(`${c.file}: unknown nearby city "${s}"`);
    const name = JSON.parse(fs.readFileSync(f, "utf8")).citylabel || s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    return `<a href="/best-seo-agency-in-${s}/">${E(name)} SEO guide</a>`;
  });
  return [
    `<h1>${T(c.h1)}</h1>`,
    coverFigure(img),
    `<p>${E(pick(k("lead"), LEAD)(c.city))}</p>`,
    ...c.intro.map((p) => `<p>${T(p)}</p>`),
    `<blockquote><p><strong>Quick answer:</strong> ${T(c.quick)}</p></blockquote>`,
    h2("market"), `<p>${T(c.market)}</p>`,
    `<ul>${c.sectors.map(([s, d]) => `<li><strong>${E(s)}:</strong> ${T(d)}</li>`).join("")}</ul>`,
    h2("seo"), `<p>${T(c.seo)}</p>`, `<ul>${c.tactics.map((t) => `<li>${T(t)}</li>`).join("")}</ul>`, `<p>${pick(k("cseo"), CITE.seo)} ${pick(k("lseo"), LINKS.seo)}</p>`,
    h2("aeo"), `<p>${T(c.aeo)}</p>`, `<ul>${c.questions.map((q) => `<li>${T(q)}</li>`).join("")}</ul>`, `<p>${pick(k("caeo"), CITE.aeo)} ${pick(k("laeo"), LINKS.aeo)}</p>`,
    h2("geo"), `<p>${T(c.geo)} ${pick(k("lgeo"), LINKS.geo)}</p>`,
    h2("aio"), `<p>${T(c.aio)} ${pick(k("laio"), LINKS.aio)}</p>`,
    h2("example"), `<p>${T(c.example)}</p>`,
    h2("areas"), `<p>${E(pick(k("areas"), AREAS)(c.city, c.areas.slice(0, -1).join(", ") + " and " + c.areas[c.areas.length - 1]))}</p>`,
    near.length ? `<p>Also see nearby: ${near.join(", ")}.</p>` : "",
    `<h2>${E(pick(k("steps"), STEPS_H)(c.city))}</h2>`, `<ul>${steps(c, k).map((x) => `<li>${E(x)}</li>`).join("")}</ul>`,
    h2("faq"), ...c.faqs.flatMap(([q, a]) => [`<h3>${E(q)}</h3>`, `<p>${T(a)}</p>`]),
    `<p>${pick(k("cta"), CTA)(E(c.city))}</p>`,
  ].filter(Boolean).join("\n");
}

function setMeta(head, attr, key, content) {
  const m = head.meta.find((x) => x.key === key);
  if (m) m.content = content; else head.meta.push({ attr, key, content });
}

function jsonld(rec, c) {
  const url = rec.url;
  const plain = (s) => s.replace(/\*\*/g, "");
  return [{
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", "@id": `${url}#article`, url, headline: c.title, description: c.desc, inLanguage: "en-IN",
        datePublished: rec.date + "+05:30", dateModified: TODAY, articleSection: CATEGORY.name,
        about: [{ "@type": "Thing", name: "Search engine optimization" }, { "@type": "Thing", name: "Answer engine optimization" },
          { "@type": "Thing", name: "Generative engine optimization" }, { "@type": "Thing", name: "Artificial intelligence optimization" }],
        contentLocation: { "@type": "City", name: c.city, containedInPlace: { "@type": "State", name: c.state } },
        author: { "@type": "Person", name: rec.author || "Openink Hub" },
        publisher: { "@id": `${BASE}/#organization` }, mainEntityOfPage: { "@id": `${url}#webpage` } },
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: c.title, description: c.desc, isPartOf: { "@id": `${BASE}/#website` },
        breadcrumb: { "@id": `${url}#breadcrumb` }, inLanguage: "en-IN" },
      { "@type": "Service", "@id": `${url}#service`, name: `SEO, AEO, GEO and AIO services in ${c.city}`,
        serviceType: "Search engine optimization", provider: { "@id": `${BASE}/#organization` },
        areaServed: { "@type": "City", name: c.city, containedInPlace: { "@type": "State", name: c.state } } },
      { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: c.faqs.map(([q, a]) => ({ "@type": "Question", name: q,
        acceptedAnswer: { "@type": "Answer", text: plain(a) } })) },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: CATEGORY.name, item: `${BASE}${CATEGORY.path}` },
        { "@type": "ListItem", position: 3, name: c.title, item: url }] },
      { "@type": "Organization", "@id": `${BASE}/#organization`, name: "openink Hub", url: `${BASE}/`,
        logo: { "@type": "ImageObject", url: `${BASE}/wp-content/uploads/2026/07/openinkhub-2.webp`, width: 928, height: 234 },
        telephone: "+91-9204135136", email: "info@openinkhub.io",
        address: { "@type": "PostalAddress", streetAddress: "203, Liya Complex, Main Road", addressLocality: "Ranchi",
          addressRegion: "Jharkhand", postalCode: "834001", addressCountry: "IN" } },
      { "@type": "WebSite", "@id": `${BASE}/#website`, url: `${BASE}/`, name: "openink Hub", publisher: { "@id": `${BASE}/#organization` } },
    ],
  }];
}

function apply(c) {
  const f = path.join(PAGES, c.file + ".json");
  if (!fs.existsSync(f)) throw new Error(`no page for ${c.file}`);
  for (const key of ["city", "state", "title", "h1", "desc", "quick", "intro", "market", "sectors", "areas", "seo", "tactics",
    "aeo", "questions", "geo", "aio", "example", "faqs"]) if (!c[key] || (Array.isArray(c[key]) && !c[key].length)) throw new Error(`${c.file}: missing ${key}`);
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  rec.citylabel = c.city;
  if (c.keyphrase) { rec.keyphrase_override = c.keyphrase; rec.keyphrase_secondary_override = c.secondary || ["AEO", "GEO", "AIO"]; }
  else { delete rec.keyphrase_override; delete rec.keyphrase_secondary_override; }
  rec.title = c.title;
  rec.h1 = c.h1.replace(/\*\*/g, "");
  rec.excerpt = c.quick.replace(/\*\*/g, "");
  const img = makeCover({ dir: "articles", slug: c.file, title: c.title, label: `SEO · AEO · GEO · AIO · ${c.state}` });
  rec.featured_image = img;
  rec.content_html = render(c, img);
  rec.content_source = "city-posts";
  rec.modified = TODAY.slice(0, 19);
  rec.categories = [CATEGORY];
  rec.faqs = c.faqs.map(([q, a]) => ({ q, a: `<p>${T(a)}</p>` }));
  const hd = rec.head;
  hd.title = c.title;
  setMeta(hd, "name", "description", c.desc);
  setMeta(hd, "property", "og:title", c.title);
  setMeta(hd, "property", "og:description", c.desc);
  setMeta(hd, "property", "og:type", "article");
  setMeta(hd, "property", "article:modified_time", TODAY);
  setMeta(hd, "property", "article:section", CATEGORY.name);
  setMeta(hd, "name", "twitter:title", c.title);
  setMeta(hd, "name", "twitter:description", c.desc);
  hd.jsonld = jsonld(rec, c);
  fs.writeFileSync(f, JSON.stringify(rec, null, 2) + "\n", "utf8");
}

const only = process.argv[2];
const entries = fs.readdirSync(SRC).filter((n) => n.endsWith(".json")).sort()
  .flatMap((n) => JSON.parse(fs.readFileSync(path.join(SRC, n), "utf8")));
// city labels first, so "near" links can use proper names
for (const c of entries) {
  const f = path.join(PAGES, c.file + ".json");
  if (fs.existsSync(f)) { const r = JSON.parse(fs.readFileSync(f, "utf8")); r.citylabel = c.city; fs.writeFileSync(f, JSON.stringify(r, null, 2) + "\n", "utf8"); }
}
let n = 0;
for (const c of entries) if (!only || c.file === only) { apply(c); n++; }
const titles = new Set(entries.map((c) => c.title)), descs = new Set(entries.map((c) => c.desc));
console.log(`composed ${n} city posts from ${entries.length} entries`);
if (titles.size !== entries.length || descs.size !== entries.length) { console.error("duplicate titles or descriptions!"); process.exit(1); }
for (const c of entries) {
  if (c.title.length > 65) console.warn(`  long title (${c.title.length}): ${c.file}`);
  if (c.desc.length > 160) console.warn(`  long description (${c.desc.length}): ${c.file}`);
}
