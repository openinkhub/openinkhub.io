/**
 * Static site generator for openinkhub.io — Node 18+, zero dependencies.
 *
 * Reads:   content/pages/*.json      one per live URL: SEO head + content (from tools/extract.py)
 *          content/home.json         homepage sections
 *          content/site-config.json  nav, footer, contact
 *          content/site.json         categories / tags
 *          static/                   images at their original /wp-content/uploads/... paths, CSS, JS
 * Writes:  dist/                     deployable site; every URL keeps its exact original path
 *
 *   npm run build
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixRecord, fixHtml, listingLabel, RULES, SQUIRRLY, COPY_MISSES } from "./seo-fix.mjs";
import { makeCover, coverFigure } from "./covers.mjs";
import { kitHtml, cardify, cardLists, faqPlain, openDetails, fixLinks } from "./layout.mjs";
import { simplifyHtml } from "./content-rules.mjs";
import { splitService, renderBlocks, ctaRow } from "./service-layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = path.join(ROOT, "content");
const DIST = path.join(ROOT, "dist");
const BASE = "https://openinkhub.io";

// ---------------------------------------------------------------- helpers
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** HTML-escape (same output as Python's html.escape). */
function E(s, quote = true) {
  s = String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return quote ? s.replace(/"/g, "&quot;").replace(/'/g, "&#x27;") : s;
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®",
  trade: "™", middot: "·", bull: "•", rarr: "→", larr: "←", times: "×" };
function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g) => {
    if (g[0] === "#") {
      const cp = g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return NAMED[g.toLowerCase()] ?? m;
  });
}

/** Python-compatible json.dumps(obj, ensure_ascii=False): ", " and ": " separators. */
function pyDumps(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(pyDumps).join(", ") + "]";
  if (typeof v === "object") return "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + pyDumps(x)).join(", ") + "}";
  return JSON.stringify(v);
}

const chars = (s) => Array.from(s ?? "");               // slice/len by code point, like Python
const cut = (s, n) => chars(s).slice(0, n).join("");
const len = (s) => chars(s).length;
const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
const stripTags = (h) => unescapeHtml(h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return m ? `${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : "";
}
const readMinutes = (h) => Math.max(1, pyRound(h.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length / 220));
const pad = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- data
const CFG = load(path.join(C, "site-config.json"));
const HOME = load(path.join(C, "home.json"));
const SS = fs.existsSync(path.join(C, "success-stories.json")) ? load(path.join(C, "success-stories.json")) : null;
const CATS = load(path.join(C, "site.json")).categories || [];
// competitor plan comparison on the city pages (content/city-comparison.json): metro pages show their own metro,
// city guides show the agencies of the nearest metro (by state)
const CMP = fs.existsSync(path.join(C, "city-comparison.json")) ? load(path.join(C, "city-comparison.json")) : null;
// AI SEO plans (content/ai-seo-plans.json): a plan links to its own page only once tools/plan-pages.mjs has built it
const AIP = fs.existsSync(path.join(C, "ai-seo-plans.json")) ? load(path.join(C, "ai-seo-plans.json")) : { plans: [] };
const planLive = (p) => fs.existsSync(path.join(C, "pages", `${p.slug}.json`));
const planLink = (p, text) => planLive(p) ? `<a href="/${p.slug}/">${text}</a>` : text;
const brochureReady = (p) => fs.existsSync(path.join(ROOT, "static", ...p.brochure.split("/").filter(Boolean)));
let BROCHURE_JS = false;
function brochureForm(key, id = "brochure") {
  const plans = key ? AIP.plans.filter((p) => p.key === key) : AIP.plans.filter(brochureReady);
  if (!plans.length || !plans.every(brochureReady)) return "";
  const pick = key ? `<input type="hidden" name="plan" value="${E(key)}">`
    : `<fieldset class="field bf-plans"><legend>Which brochures?</legend>${plans.map((p) => `<label class="bf-check"><input type="checkbox" name="plan" value="${E(p.key)}" checked> ${E(p.name)} (from ${E(p.price)}*)</label>`).join("")}</fieldset>`;
  const js = BROCHURE_JS ? "" : `<script>(function(){document.addEventListener("submit",function(e){var f=e.target.closest("form[data-brochure]");if(!f)return;e.preventDefault();
var st=f.querySelector(".bf-status"),b=f.querySelector("button[type=submit]");var plans=[].slice.call(f.querySelectorAll("[name=plan]")).filter(function(i){return i.type==="hidden"||i.checked}).map(function(i){return i.value});
if(!plans.length){st.textContent="Please choose at least one brochure.";return}
var d={name:f.elements.name.value,email:f.elements.email.value,phone:f.elements.phone.value,website:f.elements.website.value,plan:plans.join(","),page:location.pathname};
b.disabled=true;st.textContent="Sending…";
var links=function(r){return (r&&r.downloads||[]).map(function(u){return '<a href="'+u+'" download>'+u.split("/").pop()+'</a>'}).join(" · ")};
fetch("${E(AIP.brochure_endpoint || "/api/brochure")}",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)}).then(function(r){return r.json().catch(function(){return {ok:false}})}).then(function(r){
if(r.ok){f.classList.add("bf-done");st.innerHTML="Thank you! We have emailed the brochure to "+d.email.replace(/</g,"")+". Check your inbox (and spam folder). You can also download it now: "+links(r)}
else{st.innerHTML=(r.error||"Something went wrong. Please try again.")+(links(r)?" Download: "+links(r):"");b.disabled=false}},function(){st.textContent="Network error. Please try again.";b.disabled=false})})})();</script>`;
  BROCHURE_JS = true;
  return `<form class="c-card brochure-form" data-brochure id="${E(id)}-form" novalidate>
<h3>Download the AI SEO brochure${plans.length > 1 ? "s" : ""}</h3>
<p>Enter your details and we will email the ${key ? `${E(plans[0].name)} plan brochure` : "brochures"} to you from info@openinkhub.io.</p>
${pick}
<div class="field"><label for="${id}-name">Your name</label><input id="${id}-name" name="name" autocomplete="name" required minlength="2" maxlength="80"></div>
<div class="field"><label for="${id}-email">Email</label><input id="${id}-email" name="email" type="email" autocomplete="email" required maxlength="120"></div>
<div class="field"><label for="${id}-phone">Phone or WhatsApp</label><input id="${id}-phone" name="phone" type="tel" autocomplete="tel" required minlength="10" maxlength="20"></div>
<div class="bf-hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="form-actions"><button type="submit" class="btn btn-primary">Email me the brochure${plans.length > 1 ? "s" : ""}${icon("arrow")}</button></div>
<p class="bf-status" role="status" aria-live="polite"></p>
<p class="form-note">We use these details only to send the brochure and to follow up about AI SEO. See our <a href="/privacy-policy/">privacy policy</a>.</p>
</form>${js}`;
}
// markers in page content: <span data-plan="basic">Basic</span> -> link to the plan page; <div data-brochure-form="all|basic|…"></div> -> form
function planMarkers(html) {
  return html.replace(/<span data-plan="([a-z]+)">([\s\S]*?)<\/span>/g, (m, k, t) => { const p = AIP.plans.find((x) => x.key === k); return p ? planLink(p, t) : t; })
    .replace(/<div data-brochure-form="([a-z]+)"><\/div>/g, (m, k) => brochureForm(k === "all" ? null : k, k === "all" ? "brochure" : `brochure-${k}`));
}
// AI SEO platform (site-config ai_seo). On SEO / AEO / AIO / GEO / audit / on-page SEO pages the sign-up is the CTA:
// first hero button, first button in the post box and the closing band, and the target of in-content links to the platform.
// Everywhere else (and for author credits) links to the platform point to its home page.
const AIS = CFG.ai_seo, AIS_RE = AIS && new RegExp(AIS.page_pattern, "i");
const isSeoPage = (p) => !!AIS_RE && p !== "/" && AIS_RE.test(p);
function seoCta(p, html) {
  if (!AIS) return html;
  const seo = isSeoPage(p);
  html = html.replace(/(<a\b[^>]*?)href="https?:\/\/(?:www\.)?openinkhub\.cloud\/?"/g, (m, a, off, s) => {
    const author = /author[^<>]*:\s*(<[^>]+>\s*)*$/i.test(s.slice(Math.max(0, off - 60), off));
    return `${a}href="${E(seo && !author ? AIS.signup_url : AIS.platform_url)}"`;
  });
  if (!seo) return html;
  const signup = (cls) => `<a class="${cls}" href="${E(AIS.signup_url)}" target="_blank" rel="noopener">${E(AIS.signup_label)}${icon("arrow")}</a>`;
  return html
    .replace(/<div class="((?:cta-row )?hero-ctas)">([\s\S]*?)<\/div>/, (m, cls, inner) => inner.includes(AIS.signup_url) ? m :
      `<div class="${cls}">${signup("btn btn-primary")}${inner.replace(/<a class="btn btn-ghost" href="\/contact-us\/">Contact Us<\/a>/, "").replace(/btn btn-primary/g, "btn btn-ghost")}</div>`)
    .replace(/(<aside class="post-cta">[\s\S]*?)(<a class="btn btn-primary"[^>]*>[\s\S]*?<\/a>)<\/aside>/, (m, a, b) =>
      `${a}<div class="post-cta-btns">${signup("btn btn-primary")}${b.replace("btn btn-primary", "btn btn-outline-light")}</div></aside>`)
    .replace(/<div class="cta-actions">/, `<div class="cta-actions">\n      ${signup("btn btn-light")}`)
    .replace(/(<div class="cta-actions">[\s\S]*?)<a class="btn btn-light" href="(?!https:\/\/openinkhub\.cloud)/, '$1<a class="btn btn-outline-light" href="');
}
const CITY_OF = new Map();
if (fs.existsSync(path.join(C, "city-posts"))) for (const f of fs.readdirSync(path.join(C, "city-posts")).filter((x) => x.endsWith(".json")))
  for (const c of [].concat(load(path.join(C, "city-posts", f)))) CITY_OF.set(`/${c.file}/`, c);
function cityCompare(rec) {
  if (!CMP) return "";
  const slug = (/^\/best-seo-agency-in-([a-z-]+)\/$/.exec(rec.path) || [])[1];
  if (!slug) return "";
  const c = CITY_OF.get(rec.path);
  const local = CMP.cities && CMP.cities[rec.path];
  const key = CMP.metros[slug] ? slug : c && CMP.state_metro[c.state];
  const m = local && local.length >= 2 && c ? { city: c.city, agencies: local, here: true } : key && CMP.metros[key];
  if (!m) return "";
  const own = key === slug || !!m.here;
  const city = m.here ? c.city : own ? m.city : c.city;
  const ext = (href, t) => `<a href="${E(href)}" target="_blank" rel="noopener nofollow">${E(t)}</a>`;
  const o = CMP.openink;
  const rows = m.agencies.map((a) => `<tr><td>${ext(a.url, a.name)}</td><td>${E(a.based)}</td><td>${E(a.plans)}</td><td>${a.aeo_url ? ext(a.aeo_url, a.aeo) : E(a.aeo)}</td></tr>`).join("") +
    `<tr class="cmp-us"><td><a href="${E(o.href)}">${E(o.name)}</a></td><td>${E(o.based)}</td><td>${AIP.plans.length ? `AI SEO: ${AIP.plans.map((p) => `${planLink(p, E(p.name))} ${E(p.price)}*`).join(" · ")} per month${AIP.plans.some(brochureReady) ? `<br><a href="/best-seo-services-in-india/#brochure">Download AI SEO brochures</a>` : ""}` : E(o.plans)}</td><td>${E(o.aeo)}</td></tr>`;
  const lead = m.here
    ? `Published SEO plan prices from ${m.agencies.length} agencies with a page for ${E(city)} businesses, copied from each agency's own website. Several of them work remotely from another city; the second column says where each one is based.`
    : own
    ? `Published SEO, AEO and GEO plan prices from ${m.agencies.length} agencies serving ${E(m.city)}, copied from each agency's own website.`
    : `${E(city)} businesses often compare local freelancers with agencies in ${E(m.city)}, the nearest metro market. These are published SEO, AEO and GEO plan prices from ${m.agencies.length} ${E(m.city)} agencies, copied from each agency's own website.`;
  return `<section class="section cmp" id="agency-plans"><div class="wrap narrow prose">
<span class="eyebrow">${E(CMP.eyebrow)}</span>
<h2>SEO, AEO and GEO agency plans ${own ? `in ${E(city)}` : `for ${E(city)} businesses`}: price comparison</h2>
<p>${lead} Each agency name links to the page the price was taken from.</p>
<div class="table-wrap"><table><caption class="sr-only">SEO, AEO and GEO agency plans compared${own ? ` in ${E(city)}` : ""}</caption>
<thead><tr><th scope="col">Agency</th><th scope="col">Where they are based</th><th scope="col">Published monthly plans</th><th scope="col">AEO / GEO in the plan</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="cmp-note">Prices as published on each agency's website, checked ${E((m.here && CMP.cities_checked_label) || CMP.checked_label)}. Taxes such as 18% GST are extra unless the agency says otherwise, and plans change without notice, so confirm on the linked page. Openink Hub is not affiliated with these agencies. *Openink Hub prices are starting prices: terms and conditions apply, GST is applicable, prices may vary, are subject to customised solutions and depend on the number of pages required.</p>
</div></section>`;
}
const RECS = fs.readdirSync(path.join(C, "pages")).filter((n) => n.endsWith(".json")).sort()
  .map((n) => load(path.join(C, "pages", n))).filter((r) => r.status === 200 && r.head).map(fixRecord); // safe SEO auto-fixes (content/seo/rules.json)
const HTML_FIXES = {}; // image fixes applied per page, reported in /admin
const POSTS = RECS.filter((r) => r.type === "post").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const now = new Date();
const VERSION = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;

const ICONS = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 10.5h7M8.5 13.5h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pin: '<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  wa: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.1 3.1Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2Z"/>',
  map: '<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".8"/>',
  facebook: '<path d="M14 8.5V7c0-.8.5-1.2 1.2-1.2H17V3h-2.6C11.8 3 11 4.8 11 7v1.5H9V11.5h2V21h3v-9.5h2.5l.5-3Z"/>',
  linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V16M8 7.8v.1M11.5 16v-3.2c0-1.5.9-2.3 2-2.3s2 .8 2 2.3V16M11.5 10.5V16"/>',
  x: '<path d="M4 4l16 16M20 4 4 20"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
};
const icon = (name, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;

/** Absolute same-site URL -> root-relative, so the site works on any preview host. */
const rel = (url) => (url ? url.replace(/^https?:\/\/(www\.)?openinkhub\.io(?=\/|$)/, "") || "/" : url);

// Responsive images (PageSpeed "Improve image delivery"): smaller copies sit next to the original as
// name-<w>w.webp (or name-<n>.webp for logos). They are only used when the file exists in static/.
const hasStatic = (src) => !!src && src.startsWith("/") && fs.existsSync(path.join(ROOT, "static", ...src.split("?")[0].split("/").filter(Boolean)));
const sized = (src, suffix) => src.replace(/\.webp$/i, `${suffix}.webp`);
const SIZES = {
  hero: "(max-width: 900px) calc(100vw - 40px), 560px",
  work: "(max-width: 640px) calc(100vw - 40px), (max-width: 1020px) 50vw, 380px",
};
function srcsetAttr(src, widths, fullWidth, sizes) {
  const s = rel(src);
  const set = widths.filter((w) => hasStatic(sized(s, `-${w}w`))).map((w) => `${sized(s, `-${w}w`)} ${w}w`);
  return set.length ? ` srcset="${E([...set, `${s} ${fullWidth}w`].join(", "))}" sizes="${sizes}"` : "";
}
const heroSet = (src) => srcsetAttr(src, [480, 768], 1024, SIZES.hero);
const logoSrc = (src) => (hasStatic(sized(rel(src), "-128")) ? sized(rel(src), "-128") : src);

function localizeBody(h) {
  h = h.replace(/(href|src)="https?:\/\/(?:www\.)?openinkhub\.io(\/[^"]*)?"/g, (m, a, p) => `${a}="${p || "/"}"`);
  h = h.replace(/<img(?![^>]*\bloading=)/g, '<img loading="lazy" decoding="async"');
  h = h.replace(/<table/g, '<div class="table-wrap"><table').replace(/<\/table>/g, "</table></div>");
  h = h.replace(/<a href="(https?:\/\/(?!(?:www\.)?openinkhub\.io)[^"]+)"(?![^>]*target=)/g, '<a href="$1" target="_blank" rel="noopener"');
  return h;
}

// ---------------------------------------------------------------- <head>
function headHtml(rec, tags = "") {
  const hd = rec.head;
  const out = ['<meta charset="UTF-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
    tags.trim(), `<title>${E(hd.title, false)}</title>`].filter(Boolean); // charset + viewport stay first; then tracking tags
  for (const m of hd.meta) { if (m.key === "msapplication-TileImage") continue; out.push(`<meta ${m.attr}="${E(m.key)}" content="${E(m.content)}">`); }
  // dead WordPress links (feeds, oEmbed, shortlink, sitemap-as-RSS) are dropped; the sitemap gets rel="sitemap"
  const dead = (l) => l.rel === "shortlink" || (l.rel === "alternate" && /\/feed\/|wp-json|oembed|sitemap\.xml/.test(l.href));
  // brand icons (the old WordPress favicons are replaced by the set in /images/brand/icons/)
  out.push('<link rel="icon" href="/favicon.ico" sizes="48x48">', '<link rel="icon" href="/images/brand/icons/favicon-32.png" type="image/png" sizes="32x32">',
    '<link rel="icon" href="/images/brand/icons/favicon-192.png" type="image/png" sizes="192x192">',
    '<link rel="apple-touch-icon" href="/images/brand/icons/favicon-180.png" sizes="180x180">', '<link rel="manifest" href="/site.webmanifest">',
    '<meta name="msapplication-TileImage" content="/images/brand/icons/favicon-192.png">');
  for (const l of hd.links) {
    if (dead(l) || l.hreflang || /^(icon|apple-touch-icon|shortcut icon)$/i.test(l.rel)) continue;
    const extra = ["type", "sizes"].filter((k) => l[k]).map((k) => ` ${k}="${E(l[k])}"`).join("");
    out.push(`<link rel="${E(l.rel)}" href="${E(l.href)}"${extra}>`);
  }
  const canon = hd.links.find((l) => l.rel === "canonical")?.href;
  if (canon) out.push(`<link rel="alternate" hreflang="en-IN" href="${E(canon)}">`, `<link rel="alternate" hreflang="x-default" href="${E(canon)}">`);
  out.push('<link rel="sitemap" type="application/xml" href="/sitemap.xml">');
  out.push('<meta name="theme-color" content="#046bd2">');
  out.push('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  // fonts load without blocking the first paint (mobile speed); system fonts show until they arrive
  const FONTS = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=optional";
  out.push(`<link rel="preload" as="style" href="${FONTS}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${FONTS}"></noscript>`);
  out.push(`<link rel="stylesheet" href="/assets/css/site.css?v=${VERSION}">`);
  for (const j of hd.jsonld) {
    out.push("_raw" in j ? `<script type="application/ld+json">${j._raw}</script>`
      : '<script type="application/ld+json">' + pyDumps(j).replaceAll("</", "<\\/") + "</script>");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- chrome
function header(p) {
  const items = CFG.nav.map((it) => {
    const active = it.href === p ? ' aria-current="page"' : "";
    if (it.children?.length) {
      const kids = it.children.map((c) => `<li><a href="${E(c.href)}">${E(c.label)}</a></li>`).join("");
      return `<li class="has-sub"><a href="${E(it.href)}"${active}>${E(it.label)}</a><ul class="sub">${kids}</ul></li>`;
    }
    return `<li><a href="${E(it.href)}"${active}>${E(it.label)}</a></li>`;
  }).join("");
  const c = CFG.contact;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header" id="top">
  <div class="wrap nav-row">
    <a class="brand" href="/"><picture><source srcset="/images/brand/openink-logo.webp" type="image/webp"><img src="/images/brand/openink-logo.png" alt="Openink Hub logo" width="134" height="36" class="brand-logo"></picture></a>
    <nav class="main-nav" aria-label="Primary"><ul>${items}</ul></nav>
    <div class="nav-cta">
      <a class="btn btn-sm btn-ghost hide-sm" href="tel:${E(c.phone_raw)}">${icon("phone")}<span>${E(c.phone)}</span></a>
      <a class="btn btn-sm btn-primary" href="${E(c.demo_url)}" target="_blank" rel="noopener">Free Demo</a>
      <button class="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">${icon("menu")}</button>
    </div>
  </div>
  <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile"><ul>${items}</ul></nav>
</header>`;
}

function footer() {
  const c = CFG.contact;
  const SOC = { "instagram.com": ["instagram", "Instagram"], "facebook.com": ["facebook", "Facebook"], "linkedin.com": ["linkedin", "LinkedIn"], "x.com": ["x", "X (Twitter)"] };
  const social = (RULES.business?.sameAs || []).map((u) => { const k = Object.keys(SOC).find((d) => u.includes(d)); return k ? `<li><a href="${E(u)}" target="_blank" rel="noopener" aria-label="Openink Hub on ${SOC[k][1]}">${icon(SOC[k][0])}</a></li>` : ""; }).join("");
  const cols = CFG.footer.columns.map((col) =>
    `<div><h3>${E(col.title)}</h3><ul>${col.links.map((l) => `<li><a href="${E(l.href)}"${/^https?:/.test(l.href) ? " target=\"_blank\" rel=\"noopener\"" : ""}>${E(l.label)}</a></li>`).join("")}</ul></div>`).join("");
  return `<section class="cta-band">
  <div class="wrap cta-inner">
    <div><h2>Ready to be found on Google <em>and</em> in AI answers?</h2>
    <p>Talk to the Openink Hub team about SEO, AEO, GEO, AIO and automation for your business.</p></div>
    <div class="cta-actions">
      <a class="btn btn-light" href="${E(c.demo_url)}" target="_blank" rel="noopener">Schedule a Free Demo</a>
    </div>
  </div>
</section>
<footer class="site-footer">
  <div class="wrap foot-grid">
    <div class="foot-about">
      <a class="brand" href="/"><picture><source srcset="/images/brand/openink-logo.webp" type="image/webp"><img src="/images/brand/openink-logo.png" alt="Openink Hub logo" width="127" height="34" class="brand-logo"></picture></a>
      <p>${E(CFG.footer.about)}</p>
      <ul class="contact-list">
        <li>${icon("map")}${c.gbp_url ? `<a href="${E(c.gbp_url)}" target="_blank" rel="noopener" title="Openink Hub on Google Maps">${E(c.address)}</a>` : `<span>${E(c.address)}</span>`}</li>
        <li>${icon("phone")}<a href="tel:${E(c.phone_raw)}">${E(c.phone)}</a></li>
        <li>${icon("mail")}<a href="mailto:${E(c.email)}">${E(c.email)}</a></li>
      </ul>
      ${social ? `<ul class="social-list" aria-label="Openink Hub on social media">${social}</ul>` : ""}
    </div>
    ${cols}
  </div>
  <div class="foot-bar"><div class="wrap foot-bottom">
    <span>© ${now.getFullYear()} ${E(CFG.name)}. All rights reserved.</span>
    <span class="legal"><a href="/best-expert-in-answer-engine-optimization/">About Us</a> · <a href="/contact-us/">Contact Us</a> · ${CFG.footer.legal.map((l) => `<a href="${E(l.href)}">${E(l.label)}</a>`).join(" · ")}</span>
  </div></div>
</footer>
<a class="wa-float" href="${E(c.whatsapp)}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${icon("wa")}</a>
<script src="/assets/js/site.js?v=${VERSION}" defer></script>`;
}

// Tracking and ads (content/site-config.json analytics). For page speed they do not load in the critical path:
// - dataLayer + gtag() exist from the first byte, so nothing is lost; GA4 config and the GTM start event are queued
// - GTM and GA4 scripts load right after the window "load" event
// - a tag ID that Cloudflare's Google tag gateway already injects (listed in window.google_tags_first_party, served
//   from /elf8/) is not loaded a second time; the GA4 config is always queued; when the gateway serves GTM, its own gtag (/elf8/) sends
//   that GA4 hit, so gtag.js is fetched from googletagmanager.com only when the gateway is off
// - AdSense loads on the first scroll, tap, click or key press (Auto ads were inserting a placeholder during load that
//   pushed the whole page down: CLS 1.0 on desktop). The account meta tag and ads.txt are enough for site verification.
const GTM = /^GTM-[A-Z0-9]+$/.test(CFG.analytics?.gtm || "") ? CFG.analytics.gtm : "";
const GA4 = /^G-[A-Z0-9]+$/.test(CFG.analytics?.ga4 || "") ? CFG.analytics.ga4 : "";
const ADSENSE = /^ca-pub-\d{16}$/.test(CFG.analytics?.adsense || "") ? CFG.analytics.adsense : "";
const tagsHead = (GTM || GA4 || ADSENSE) ? `${ADSENSE ? `<meta name="google-adsense-account" content="${ADSENSE}">
` : ""}<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
(function(w,d){function add(src,x){var j=d.createElement('script');j.async=true;j.src=src;if(x)j.crossOrigin='anonymous';d.head.appendChild(j)}
var fp=[].concat(w.google_tags_first_party||[]).map(String);function cf(id){return fp.indexOf(id)>-1}
${GA4 ? `if(!cf('${GA4}')){gtag('js',new Date());gtag('config','${GA4}');}` : ""}${GTM ? `if(!cf('${GTM}'))dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});` : ""}
function tags(){${GTM ? `if(!cf('${GTM}'))add('https://www.googletagmanager.com/gtm.js?id=${GTM}');` : ""}${GA4 ? `if(!fp.length)add('https://www.googletagmanager.com/gtag/js?id=${GA4}');` : ""}}
if(d.readyState==='complete')tags();else w.addEventListener('load',function(){setTimeout(tags,0)});
${ADSENSE ? `var ads=false,ev=['scroll','pointerdown','keydown','touchstart'];function adsense(){if(ads)return;ads=true;ev.forEach(function(e){w.removeEventListener(e,adsense)});add('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}',1)}
ev.forEach(function(e){w.addEventListener(e,adsense,{passive:true,once:true})});` : ""}
})(window,document);
</script>
` : "";
const gtmBody = GTM ? `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
` : "";

const document_ = (rec, body, bodyClass = "") => `<!DOCTYPE html>
<html lang="en-IN">
<head>
${headHtml(rec, tagsHead)}
</head>
<body class="${bodyClass}">
${gtmBody}
${header(rec.path)}
<main id="main">
${body}
</main>
${footer()}
</body>
</html>
`;

function breadcrumb(trail) {
  const parts = ['<a href="/">Home</a>', ...trail.map(([label, href]) =>
    href ? `<a href="${E(href)}">${E(label)}</a>` : `<span aria-current="page">${E(label)}</span>`)];
  return '<nav class="crumbs" aria-label="Breadcrumb">' + parts.join('<span class="sep">/</span>') + "</nav>";
}

function postCard(r) {
  const img = r.featured_image;
  const im = img ? `<img src="${E(rel(img.src))}" alt="${E(img.alt || r.title)}"${img.width && img.height ? ` width="${img.width}" height="${img.height}"` : ""} loading="lazy" decoding="async">`
    : `<div class="card-ph">${icon("spark")}</div>`;
  const cat = r.categories?.length ? r.categories[0].name : "Article";
  const ex = r.excerpt || "";
  return `<article class="post-card">
  <a href="${E(r.path)}" class="post-card-img"${img ? "" : ` aria-label="${E(stripTags(r.title || ""))}"`}>${im}</a>
  <div class="post-card-body">
    <span class="tag">${E(cat)}</span>
    <h3><a href="${E(r.path)}">${E(r.title)}</a></h3>
    <p>${E(cut(ex, 150))}${len(ex) > 150 ? "…" : ""}</p>
    <span class="meta">${icon("clock")}${fmtDate(r.date || "")}</span>
  </div>
</article>`;
}

// ---------------------------------------------------------------- content shaping
/** -> [eyebrowText, h1InnerHtml, remainingBody]. Keeps the page's real H1 (with <em> accents). */
function splitH1(content, fallback, raw = false) {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(content);
  if (!m) return ["", E(fallback), content];
  const inner = m[1].replace(/<\/?(?!em\b|strong\b|b\b)[a-z0-9]+[^>]*>/g, "").trim();
  let pre = content.slice(0, m.index);
  const post = content.slice(m.index + m[0].length);
  const preTxt = pre.replace(/<[^>]+>/g, " ").trim();
  let eyebrow = "";
  if (preTxt && len(preTxt) < 140 && !pre.includes("<img")) { eyebrow = unescapeHtml(preTxt.replace(/\s+/g, " ")); pre = ""; }
  return [eyebrow, inner, raw ? pre + post : enhance(pre + post)];
}

const P_RUN = /(?:<p>(?:(?!<\/p>)[\s\S]){1,60}?<\/p>\s*){4,}/g;

/** Elementor leftovers -> components: tiny-paragraph runs become a stat grid; a short line before <h2> a kicker. */
function enhance(body) {
  body = body.replace(P_RUN, (whole) => {
    let items = [...whole.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((x) => stripTags(x[1]));
    if (items.some((i) => len(i) > 48)) return whole;
    let tail = "";
    if (items.length % 2 && !/\d/.test(items.at(-1))) {
      tail = `<p class="kicker">${E(items.at(-1), false)}</p>`;
      items = items.slice(0, -1);
    }
    const pairs = [];
    for (let i = 0; i + 1 < items.length; i += 2) pairs.push([items[i], items[i + 1]]);
    const statLike = pairs.filter(([v]) => /\d|%|∞|Full|24\/7/.test(v) || len(v) <= 12).length;
    if (items.length >= 4 && items.length % 2 === 0 && statLike >= pairs.length - 1) {
      const cells = pairs.map(([v, l]) => `<div class="stat"><strong>${E(v, false)}</strong><span>${E(l, false)}</span></div>`).join("");
      return `<div class="stat-grid">${cells}</div>${tail}`;
    }
    return whole;
  });
  return body.replace(/<p>([^<]{2,60})<\/p>(\s*<h2)/g, (whole, t, h2) =>
    /[.:?]$/.test(t.trim()) ? whole : `<p class="kicker">${t.trim()}</p>${h2}`);
}

function faqBlock(faqs, h2 = "Frequently Asked Questions") {
  if (!faqs?.length) return "";
  if (RULES.autofix.plainFaq) return faqPlain(faqs, h2, localizeBody);
  const items = faqs.map((f) => `<details class="faq"><summary>${E(f.q.replace(/<[^>]+>/g, ""))}</summary>` +
    `<div class="faq-a">${localizeBody(f.a)}</div></details>`).join("");
  return `<section class="section"><div class="wrap narrow"><h2 class="sec-title">${E(h2)}</h2>${items}</div></section>`;
}

const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, "");
const contentHasFaq = (content, faqs) =>
  Boolean(faqs?.length) && faqs.slice(0, 2).every((f) => squash(content).includes(cut(squash(f.q), 40)));

// ---------------------------------------------------------------- templates
// layout rules (tools/layout.mjs): links, open FAQs, card grids and H2 cards; topic kits after the content
const KITS = load(path.join(C, "seo", "kits.json"));
const TITLE_OF = new Map(RECS.map((r) => [r.path, stripTags(r.card_title || r.title || r.h1 || "").replace(/\s*[|–-]\s*openink Hub$/i, "").replace(/\s*\(20\d\d\)/, "")]));
const titleOf = (href) => TITLE_OF.get(href.replace(/^https?:\/\/(www\.)?openinkhub\.io/, "").replace(/[?#].*$/, "")) || "";
function shape(body, legal) {
  const A = RULES.autofix;
  if (A.linkText) body = fixLinks(body, titleOf);
  if (A.plainFaq) body = openDetails(body);
  if (A.cardLayout && !legal) body = cardify(cardLists(body));
  return body;
}
// In-page links (#features, #contact-form…) whose target id was lost in the WordPress migration:
// attach the id to the best-matching heading, or to the start of the page content.
function fixAnchors(html) {
  const missing = [...new Set([...html.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]))].filter((id) => !new RegExp(`id="${id}"`).test(html));
  for (const id of missing) {
    const words = id.split(/[-_]/).filter((w) => w.length >= 4 && !/^(details|panel|section)$/.test(w));
    const h = words.length && [...html.matchAll(/<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g)]
      .find((m) => !/\sid=/.test(m[2]) && words.some((w) => m[3].toLowerCase().includes(w.toLowerCase())));
    if (h) html = html.replace(h[0], `<h${h[1]} id="${id}"${h[2]}>${h[3]}</h${h[1]}>`);
    else html = html.replace("<!--seo:content-->", `<!--seo:content--><span id="${id}" class="anchor"></span>`);
  }
  return html;
}
const NO_KIT = new Set([]); // every page gets the parts it lacks
const kitFor = (rec, body, legal) => (RULES.autofix.topicKits && !legal && !NO_KIT.has(rec.path.replace(/^\/+|\/+$/g, "")) ? kitHtml(rec, body, KITS) : "");

const LEGAL = new Set(["privacy-policy", "terms", "refund", "shipping", "disclaimer", "cookie"]);

// "Articles on this topic" list on hub pages that content-plan posts point to (brief_hub)
function hubArticles(rec) {
  const list = POSTS.filter((p) => p.brief_hub === rec.path).sort((x, y) => (x.brief_id || 0) - (y.brief_id || 0));
  if (!list.length) return "";
  return `<section class="section"><div class="wrap narrow prose"><h2>Articles on this topic</h2><ul>${list.map((p) =>
    `<li><a href="${E(p.path)}">${E(p.title)}</a></li>`).join("")}</ul></div></section>
`;
}

// ---------------------------------------------------------------- About Us (home-page style)
// The page linked as "About Us" in the menu: home-style hero, every H2 section as a card grid (or one card for prose),
// the team as person cards (data in content/home.json -> team), FAQs as open cards.
const ABOUT_PATH = (CFG.nav.find((n) => /about/i.test(n.label)) || {}).href || "";
function teamSection(H) {
  const t = H.team;
  const people = t.people.map((p) => `<figure class="person">
  <img src="${E(rel(p.img))}" alt="${E(p.name)}, ${E(p.role)} at Openink Hub" loading="lazy" width="400" height="279">
  <figcaption><strong>${E(p.name)}</strong><span>${E(p.role)}</span>
  ${p.experience ? `<ul class="p-meta"><li><b>${E(p.experience)}</b> experience</li><li><b>${E(p.specialization)}</b></li><li>${E(p.highlight)}</li></ul>` : ""}
  </figcaption></figure>`).join("");
  return `<section class="section section-alt" id="team"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">Our team</span><h2 class="sec-title">${E(t.h2)}</h2><p>${E(t.intro)}</p></div>
  <div class="team-grid">${people}</div>
</div></section>`;
}
function aboutTpl(rec) {
  let [eyebrow, h1, body] = splitH1(rec.content_html || "", rec.h1 || rec.title);
  if (RULES.autofix.linkText) body = fixLinks(body, titleOf);
  if (RULES.autofix.plainFaq) body = openDetails(body);
  let lead = "";
  const m = /^\s*<p>([\s\S]*?)<\/p>/.exec(body);
  if (m && len(m[1].replace(/<[^>]+>/g, "")) < 420) { lead = m[1]; body = body.slice(m[0].length); }
  // hero image: the first figure/image in the content (cover), removed from the body
  let heroImg = "";
  const fig = /<figure>\s*(<img\b[^>]*>)\s*<\/figure>/.exec(body);
  if (fig) { heroImg = fig[1].replace(/<img\b/, '<img fetchpriority="high"'); body = body.replace(fig[0], ""); }
  // otherwise the home page hero image, so the hero has the same two-column look as the home page
  if (!heroImg && HOME.hero?.image?.src) heroImg = `<img src="${E(rel(HOME.hero.image.src))}"${heroSet(HOME.hero.image.src)} alt="${E(HOME.hero.image.alt || "Openink Hub")}" width="1024" height="576" fetchpriority="high">`;
  const quick = /<p>\s*<strong>Quick answer:<\/strong>([\s\S]*?)<\/p>/.exec(body);
  if (quick) body = body.replace(quick[0], "");
  // ---- sections from content/about.json, each with the matching home-page component
  const A = load(path.join(C, "about.json"));
  const keep = [rec.keyphrase, ...(rec.keyphrase_secondary || [])].filter(Boolean);
  const T = (s) => E(RULES.autofix.simpleWords ? simplifyHtml(String(s), keep) : String(s));
  let alt = false;
  const sec = (eb, h2, inner, intro = "", wide = true) => {
    const cls = (alt = !alt) ? "section" : "section section-alt";
    return `<section class="${cls}"><div class="wrap${wide ? "" : " narrow"}"><div class="sec-head">${eb ? `<span class="eyebrow">${T(eb)}</span>` : ""}` +
      `<h2 class="sec-title">${T(h2)}</h2>${intro ? `<p>${T(intro)}</p>` : ""}</div>${inner}</div></section>`;
  };
  const cards = (list, numbered = false) => `<div class="svc-grid about-grid">${list.map(([t, d, href], i) =>
    `<article class="svc-card">${numbered ? `<span class="num">${String(i + 1).padStart(2, "0")}</span>` : ""}<h3>${T(t)}</h3><p>${T(d)}</p>` +
    `${href ? `<a class="link-arrow" href="${E(href)}">Explore ${T(t)}${icon("arrow")}</a>` : ""}</article>`).join("")}</div>`;
  const stats = (list, cls = "") => `<ul class="about-stats ${cls}">${list.map((s) => `<li><b>${T(s.value)}</b><span>${T(s.label)}</span></li>`).join("")}</ul>`;
  let out = "";
  // key figures strip
  out += `<section class="section section-tight"><div class="wrap">${stats(A.figures, "figures")}</div></section>`;
  alt = true;
  // problem: metrics + problem cards
  const P = A.problem;
  out += sec(P.eyebrow, P.h2, `<ul class="about-metrics">${P.metrics.map(([v, l]) => `<li><b>${T(v)}</b><span>${T(l)}</span></li>`).join("")}</ul>
  <p class="about-note">${T(P.metrics_note)}</p>${cards(P.cards)}`, P.intro);
  // solution: ecosystem cards + benefit strip
  const S = A.ecosystem;
  out += sec(S.eyebrow, S.h2, cards(S.cards) + stats(S.strip, "strip"), S.intro);
  // benefits: before/after bars, traffic chart, outcomes
  const B = A.benefits, maxV = Math.max(...B.chart.map(([, v]) => v));
  const cmpCard = (B.compare || []).length ? `<div class="c-card about-compare"><h3>${T(B.compare_title)}</h3>${B.compare.map((c) => `<div class="cmp"><strong>${T(c.label)}</strong>
    <div class="bar-row"><span>Before</span><div class="bar"><i style="width:${c.before}%"></i></div><b>${c.before}%</b></div>
    <div class="bar-row is-after"><span>With Openink</span><div class="bar"><i style="width:${c.after}%"></i></div><b>${c.after}%</b></div></div>`).join("")}</div>` : "";
  out += sec(B.eyebrow, B.h2, `<div class="${cmpCard ? "about-two" : "about-one"}">${cmpCard}
  <div class="c-card about-chart"><h3>${T(B.chart_title)}</h3><ul class="chart">${B.chart.map(([l, v]) =>
    `<li><b>${v}</b><div class="plot"><i style="height:${Math.round((v / maxV) * 100)}%"></i></div><span>${T(l)}</span></li>`).join("")}</ul><p class="about-note">${T(B.chart_note)}</p></div>
</div><ul class="about-outcomes">${B.outcomes.map((o) => `<li>${icon("check")}<span>${T(o)}</span></li>`).join("")}</ul>`, B.intro);
  // market timing: numbered cards + banner
  const W = A.why_now;
  out += sec(W.eyebrow, W.h2, cards(W.cards, true) + `<div class="about-banner"><b>${T(W.banner.value)}</b><span>${T(W.banner.label)}</span></div>`);
  // product: 8 numbered modules + platform features
  const PR = A.product;
  out += sec(PR.eyebrow, PR.h2, cards(PR.modules, true) + `<h3 class="about-sub">Platform features</h3>` + cards(PR.features), PR.intro);
  // audit framework: category cards with check counts + team expertise
  const AU = A.audit;
  out += sec(AU.eyebrow, AU.h2, `<div class="svc-grid about-grid">${AU.categories.map(([n, d, c]) =>
    `<article class="svc-card"><span class="badge">${c} checks</span><h3>${T(n)}</h3><p>${T(d)}</p></article>`).join("")}</div>
  <p class="about-note about-total">${T(AU.total)}</p>
  <div class="c-card about-expertise"><h3>${T(AU.expertise_h3)}</h3><p>${T(AU.expertise)}</p>
  <ul class="check-list">${AU.skills.map((s) => `<li>${icon("check")}<div><strong>${T(s)}</strong></div></li>`).join("")}</ul></div>`, AU.intro);
  // team (content/home.json -> team)
  out += teamSection(HOME); alt = false; // team is grey, so the next section is white
  // mission & vision
  const M = A.mission;
  out += sec(M.eyebrow, M.h2, `<div class="about-two"><div class="c-card"><h3>Our mission</h3><p>${T(M.mission)}</p></div>
  <div class="c-card"><h3>Our vision</h3><p>${T(M.vision)}</p></div></div>${cards(M.cards)}`);
  // in short (content/seo/summaries.json)
  const SUM = load(path.join(C, "seo", "summaries.json"))[rec.path];
  if (SUM) out += sec("", `In short: ${rec.keyphrase_override ? rec.keyphrase_override.replace(/\baeo\b/gi, "AEO") : "about Openink Hub"}`, `<div class="c-card prose"><p>${RULES.autofix.simpleWords ? simplifyHtml(SUM, keep) : SUM}</p></div>`, "", false);
  // FAQ: open cards (FAQPage schema comes from the same questions via rec.faqs)
  const F = A.faq;
  out += sec(F.eyebrow, F.h2, `<div class="faq-list">${F.items.map(([q, a]) => `<div class="faq-card"><h3>${T(q)}</h3><div class="faq-a"><p>${T(a)}</p></div></div>`).join("")}</div>`, "", false);
  const quickText = A.quick || (quick ? quick[1] : "");
  const k = kitFor(rec, out, false);
  const faqs = "";
  const crumb = len(rec.title) < 60 ? rec.title : cut(stripTags(h1), 60);
  return document_(rec, `<section class="hero hero-about">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">${breadcrumb([[crumb, null]])}
      ${eyebrow ? `<span class="eyebrow">${E(eyebrow)}</span>` : ""}
      <h1>${h1}</h1>
      <!--seo:content-->${lead ? `<p class="lead">${lead}</p>` : ""}<!--/seo:content-->
      <div class="hero-ctas"><a class="btn btn-primary" href="${E(CFG.contact.demo_url)}" target="_blank" rel="noopener">Schedule a Free Demo${icon("arrow")}</a><a class="btn btn-ghost" href="/contact-us/">Contact Us</a></div>
      ${quickText ? `<!--seo:content--><div class="quick-answer"><p><strong>Quick answer:</strong> ${quickText}</p></div><!--/seo:content-->` : ""}
    </div>
    ${heroImg ? `<div class="hero-visual">${heroImg}</div>` : ""}
  </div>
</section>
<!--seo:content-->${out}<!--/seo:content-->
${k ? `<section class="section kit"><div class="wrap narrow prose">${localizeBody(k)}</div></section>` : ""}
${faqs}`, "is-page is-about");
}

// ---------------------------------------------------------------- contact page (home-page style, content/contact.json)
function contactTpl(rec) {
  const X = load(path.join(C, "contact.json"));
  const keep = [rec.keyphrase, rec.keyphrase_override, ...(rec.keyphrase_secondary || [])].filter(Boolean);
  const T = (s) => E(RULES.autofix.simpleWords ? simplifyHtml(String(s), keep) : String(s));
  const ext = (h) => (/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : "");
  const h1 = rec.h1 || rec.title;
  let alt = false;
  const sec = (eb, h2, inner, intro = "", wide = true, id = "") => {
    const cls = (alt = !alt) ? "section" : "section section-alt";
    return `<section class="${cls}"${id ? ` id="${id}"` : ""}><div class="wrap${wide ? "" : " narrow"}"><div class="sec-head">${eb ? `<span class="eyebrow">${T(eb)}</span>` : ""}` +
      `<h2 class="sec-title">${T(h2)}</h2>${intro ? `<div class="sec-lead"><p>${T(intro)}</p></div>` : ""}</div>${inner}</div></section>`;
  };
  let out = `<section class="section section-tight"><div class="wrap"><ul class="about-stats figures">${X.stats.map((s) => `<li><b>${T(s.value)}</b><span>${T(s.label)}</span></li>`).join("")}</ul></div></section>`;
  alt = true;
  const ch = X.channels;
  out += sec(ch.eyebrow, ch.h2, `<div class="svc-grid contact-cards">${ch.cards.map((c) => `<article class="svc-card contact-channel">
  <div class="svc-ico">${icon(c.icon)}</div><span class="card-tag">${T(c.label)}</span><h3>${T(c.title)}</h3>
  <p class="channel-value">${c.href ? `<a href="${E(c.href)}"${ext(c.href)}>${E(c.value)}</a>` : E(c.value)}</p><p>${T(c.text)}</p>
  ${c.href && c.cta ? `<a class="link-arrow" href="${E(c.href)}"${ext(c.href)}>${T(c.cta)}${icon("arrow")}</a>` : ""}</article>`).join("")}</div>`, ch.intro);
  const pr = X.process;
  out += sec(pr.eyebrow, pr.h2, `<div class="svc-grid process-cards">${pr.steps.map(([t, d], i) =>
    `<article class="svc-card"><span class="num">${String(i + 1).padStart(2, "0")}</span><h3>${T(t)}</h3><p>${T(d)}</p></article>`).join("")}</div>`, pr.intro);
  const g = X.goals;
  out += sec(g.eyebrow, g.h2, `<div class="svc-grid goal-cards">${g.cards.map(([t, d, href, label]) =>
    `<article class="svc-card"><h3>${T(t)}</h3><p>${T(d)}</p><a class="link-arrow" href="${E(href)}">${E(label)}${icon("arrow")}</a></article>`).join("")}</div>`, g.intro);
  const f = X.form;
  const form = `<form class="c-card contact-form" id="contact-form-el" onsubmit="return false">
  <div class="field"><label for="cf-name">Your name</label><input id="cf-name" name="name" autocomplete="name" required></div>
  <div class="field"><label for="cf-phone">Phone or WhatsApp</label><input id="cf-phone" name="phone" type="tel" autocomplete="tel"></div>
  <div class="field"><label for="cf-service">What do you need help with?</label><select id="cf-service" name="service">${f.services.map((s) => `<option>${E(s)}</option>`).join("")}</select></div>
  <div class="field"><label for="cf-msg">Your goal or question</label><textarea id="cf-msg" name="message" rows="4" required></textarea></div>
  <div class="form-actions"><button type="button" class="btn btn-primary" data-send="mail">Send by email${icon("arrow")}</button></div>
  <p class="form-alt">Or send with: <button type="button" class="link-btn" data-send="gmail">Gmail</button> · <button type="button" class="link-btn" data-send="outlook">Outlook</button> · <button type="button" class="link-btn" data-send="mailapp">Default email app</button> · <button type="button" class="link-btn" data-send="copymsg">Copy message</button> <span class="form-copied" role="status" aria-live="polite"></span></p>
  <p class="form-alt">Using Zoho Mail, Hostinger or another webmail? Click <strong>Copy message</strong>, then paste it into a new email to <a href="mailto:info@openinkhub.io">info@openinkhub.io</a>.</p>
  <p class="form-note">${T(f.note)}</p>
</form>
<script>(function(){var f=document.getElementById("contact-form-el");if(!f)return;var TO="info@openinkhub.io";
// phones and tablets: mailto opens the device's mail app (Gmail on most Android phones, with a chooser if there are several);
// computers: open Gmail's compose window in a new tab, because many computers have no mail app set up for mailto links
var mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Macintosh/.test(navigator.userAgent));
f.addEventListener("click",function(e){var b=e.target.closest("[data-send]");if(!b)return;
var v=function(n){return (f.elements[n].value||"").trim()};if(!v("name")||!v("message")){f.reportValidity();return}
var t="Hi Openink Hub, I'm "+v("name")+(v("phone")?" ("+v("phone")+")":"")+".\\nService: "+v("service")+"\\n\\n"+v("message");
var su="Enquiry: "+v("service"),mailto="mailto:"+TO+"?subject="+encodeURIComponent(su)+"&body="+encodeURIComponent(t);
var gmail="https://mail.google.com/mail/?view=cm&fs=1&to="+encodeURIComponent(TO)+"&su="+encodeURIComponent(su)+"&body="+encodeURIComponent(t);
var outlook="https://outlook.live.com/mail/0/deeplink/compose?to="+encodeURIComponent(TO)+"&subject="+encodeURIComponent(su)+"&body="+encodeURIComponent(t);
var web=function(u){var g=window.open(u,"_blank","noopener");if(!g)location.href=u};
var k=b.dataset.send;
if(k==="copymsg"){var all="To: "+TO+"\\nSubject: "+su+"\\n\\n"+t,st=f.querySelector(".form-copied");var ok=function(){st.textContent="Copied. Paste it into a new email to "+TO+"."};if(navigator.clipboard)navigator.clipboard.writeText(all).then(ok,function(){prompt("Copy this message:",all)});else prompt("Copy this message:",all)}
else if(k==="gmail")web(gmail);
else if(k==="outlook")web(outlook);
else if(k==="mailapp"||mobile)location.href=mailto;
else web(gmail)});})();</script>`;
  const side = `<aside class="c-card contact-side"><h3>${T(f.details_title)}</h3><dl class="contact-dl">${f.details.map(([k, v, h]) =>
    `<dt>${T(k)}</dt><dd>${h ? `<a href="${E(h)}"${ext(h)}>${E(v)}</a>` : E(v)}</dd>`).join("")}</dl>
  <h3>${T(f.covered_title)}</h3><ul class="chips">${f.covered.map((s) => `<li class="chip">${E(s)}</li>`).join("")}</ul></aside>`;
  out += sec(f.eyebrow, f.h2, `<div class="contact-form-grid">${form}${side}</div>`, f.intro, true, "contact-form");
  out += sec("FAQ", "Frequently asked questions", `<div class="faq-list">${(rec.faqs || []).map((q) => `<div class="faq-card"><h3>${T(stripTags(q.q))}</h3><div class="faq-a">${localizeBody(q.a)}</div></div>`).join("")}</div>`, "", false);
  out += sec("In short", "In short: contact Openink Hub", `<div class="c-card prose"><p>${T(X.in_short)}</p></div>`, "", false);
  out += sec("Explore", "Related services", `<div class="svc-grid svc-cards-auto">${X.related.map(([t, h]) =>
    `<a class="svc-card svc-link" href="${E(h)}"><h3>${E(t)}</h3><span class="link-arrow">Explore${icon("arrow")}</span></a>`).join("")}</div>`);
  const k = kitFor(rec, out, false);
  const img = rec.featured_image;
  const heroImg = img ? `<img src="${E(rel(img.src))}" alt="${E(img.alt || stripTags(h1))}" width="${img.width || 1200}" height="${img.height || 630}" fetchpriority="high">`
    : `<img src="/images/pages/contact-us.svg" alt="Contact Openink Hub" width="1200" height="630" fetchpriority="high">`;
  const ctas = X.ctas.map((c, i) => `<a class="btn ${i ? "btn-ghost" : "btn-primary"}" href="${E(c.href)}"${ext(c.href)}>${E(c.label)}${i ? "" : icon("arrow")}</a>`).join("");
  return document_(rec, `<section class="hero hero-about hero-service">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">${breadcrumb([["Contact Us", null]])}
      <span class="eyebrow">${T(X.eyebrow)}</span>
      <h1>${E(stripTags(h1))}</h1>
      <!--seo:content--><p class="lead">${T(X.lead)}</p><!--/seo:content-->
      <div class="hero-ctas">${ctas}</div>
      <!--seo:content--><div class="quick-answer"><p><strong>Quick answer:</strong> ${T(X.quick)}</p></div><!--/seo:content-->
    </div>
    <div class="hero-visual"><!--seo:content-->${heroImg}<!--/seo:content--></div>
  </div>
</section>
<!--seo:content-->${out}<!--/seo:content-->
${k ? `<section class="section kit"><div class="wrap narrow prose">${localizeBody(k)}</div></section>` : ""}`, "is-page is-about is-contact");
}

// ---------------------------------------------------------------- service pages (home-page style)
// Every page in the Services menu (and the services hub) shares one layout: home-style hero (headline, lead, the page's
// own CTA buttons, quick answer, image), a stat strip, then each H2 section full width with eyebrow, heading, lead and
// components rebuilt from the imported widgets (tools/service-layout.mjs). Sections alternate white / grey.
const SVC_NAV = CFG.nav.find((n) => n.label === "Services") || {};
const SERVICE_PATHS = new Set([SVC_NAV.href, ...(SVC_NAV.children || []).map((c) => c.href)].filter((p) => p && p !== ABOUT_PATH));
function serviceTpl(rec) {
  let [eyebrow, h1, body] = splitH1(rec.content_html || "", rec.h1 || rec.title, true);
  if (RULES.autofix.linkText) body = fixLinks(body, titleOf);
  if (RULES.autofix.plainFaq) body = openDetails(body);
  body = hubGrids(localizeBody(cardLists(body)));
  let lead = "";
  const m = /^\s*<p>([\s\S]*?)<\/p>/.exec(body);
  if (m && len(m[1].replace(/<[^>]+>/g, "")) < 420 && !/<a\b/.test(m[1])) { lead = m[1]; body = body.slice(m[0].length); }
  let heroImg = "";
  const fig = /<figure>\s*(<img\b[^>]*>)\s*<\/figure>/.exec(body);
  if (fig) { heroImg = fig[1].replace(/<img\b/, '<img fetchpriority="high"'); body = body.replace(fig[0], ""); }
  else if (rec.featured_image) heroImg = `<img src="${E(rel(rec.featured_image.src))}" alt="${E(rec.featured_image.alt || stripTags(h1))}" width="${rec.featured_image.width || 1200}" height="${rec.featured_image.height || 630}" fetchpriority="high">`;
  else if (HOME.hero?.image?.src) heroImg = `<img src="${E(rel(HOME.hero.image.src))}"${heroSet(HOME.hero.image.src)} alt="${E(stripTags(h1))}" width="1024" height="576" fetchpriority="high">`;
  const quick = /<p>\s*<strong>Quick answer:<\/strong>([\s\S]*?)<\/p>/.exec(body);
  if (quick) body = body.replace(quick[0], "");
  const { heroCtas, heroStats, preRest, sections } = splitService(body);
  let alt = false, out = "";
  const secOpen = () => ((alt = !alt) ? "section" : "section section-alt");
  if (heroStats.length >= 2) { out += `<section class="section section-tight"><div class="wrap"><ul class="about-stats figures">${heroStats.map((s) => `<li><b>${E(s.value)}</b><span>${E(s.label)}</span></li>`).join("")}</ul></div></section>`; alt = false; }
  const preHtml = preRest.map((b) => b.html).join("");
  if (stripTags(preHtml).length > 30) out += `<section class="${secOpen()}"><div class="wrap narrow"><div class="c-card prose">${preHtml}</div></div></section>`;
  // recent client work (home.json work.pages) goes before the "In short" / FAQ / related services block
  let workDone = !HOME.work?.pages?.[rec.path] && !SS?.cta?.pages?.[rec.path];
  const addWork = () => { if (!workDone) { out += (HOME.work?.pages?.[rec.path] ? workForPage(rec.path, secOpen()) : "") + (SS?.cta?.pages?.[rec.path] ? successCta(rec.path, secOpen()) : ""); workDone = true; } };
  for (const s of sections) {
    if (/^in short|asked questions|^faq|frequently|^related services/i.test(s.title)) addWork();
    const cls = secOpen();
    const head = (ld = "") => `<div class="sec-head">${s.eyebrow ? `<span class="eyebrow">${E(s.eyebrow)}</span>` : ""}<h2 class="sec-title">${E(s.title)}</h2>${ld ? `<div class="sec-lead">${ld}</div>` : ""}</div>`;
    if (/asked questions|^faq|frequently/i.test(s.title)) {
      const items = []; let cur = null;
      // split on every h3, even inside wrappers (e.g. opened <details>)
      const all = s.blocks.map((b) => b.html).join("");
      for (const seg of all.split(/(?=<h3[\s>])/)) {
        const q = /^<h3[^>]*>([\s\S]*?)<\/h3>/.exec(seg);
        if (!q) continue;
        cur = { q: stripTags(q[1]), a: seg.slice(q[0].length).replace(/<\/?(details|summary|div)\b[^>]*>/g, "").trim() };
        items.push(cur);
      }
      out += `<section class="${cls}"><div class="wrap narrow">${head()}<div class="faq-list">${items.map((f) => `<div class="faq-card"><h3>${E(f.q)}</h3><div class="faq-a">${f.a}</div></div>`).join("")}</div></div></section>`;
      continue;
    }
    if (/^related services$/i.test(s.title)) {
      const links = s.blocks.flatMap((b) => [...b.html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]);
      out += `<section class="${cls}"><div class="wrap">${head()}<div class="svc-grid svc-cards-auto">${links.map((l) =>
        `<a class="svc-card svc-link" href="${E(l[1])}"><h3>${stripTags(l[2])}</h3><span class="link-arrow">Explore${icon("arrow")}</span></a>`).join("")}</div></div></section>`;
      continue;
    }
    const r = renderBlocks(s.blocks, { icon });
    const narrow = !/svc-grid|about-stats|about-metrics|guide-grid|svc-cards/.test(r.parts) && !(r.parts + r.introCard).includes("<table");
    out += `<section class="${cls}"><div class="wrap${narrow ? " narrow" : ""}">${head(r.lead)}${r.introCard}${r.parts}</div></section>`;
  }
  addWork(); // no FAQ / in-short section: add it at the end
  const k = kitFor(rec, body, false);
  const faqs = /asked questions|frequently/i.test(body) || contentHasFaq(body, rec.faqs) ? "" : faqBlock(rec.faqs);
  const crumb = len(rec.title) < 60 ? rec.title : cut(stripTags(h1), 60);
  const ctas = heroCtas ? ctaRow(heroCtas, "hero-ctas") :
    `<div class="hero-ctas"><a class="btn btn-primary" href="${E(CFG.contact.demo_url)}" target="_blank" rel="noopener">Schedule a Free Demo${icon("arrow")}</a><a class="btn btn-ghost" href="/contact-us/">Contact Us</a></div>`;
  return document_(rec, `<section class="hero hero-about hero-service">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">${breadcrumb([["Services", SVC_NAV.href !== rec.path ? SVC_NAV.href : null], ...(SVC_NAV.href !== rec.path ? [[crumb, null]] : [])])}
      ${eyebrow ? `<span class="eyebrow">${E(eyebrow)}</span>` : ""}
      <h1>${h1}</h1>
      <!--seo:content-->${lead ? `<p class="lead">${lead}</p>` : ""}${quick ? `<div class="quick-answer"><p><strong>Quick answer:</strong>${quick[1]}</p></div>` : ""}<!--/seo:content-->
      ${ctas}
    </div>
    ${heroImg ? `<div class="hero-visual"><!--seo:content-->${heroImg}<!--/seo:content--></div>` : ""}
  </div>
</section>
<!--seo:content-->${out}<!--/seo:content-->
${k ? `<section class="section kit"><div class="wrap narrow prose">${localizeBody(k)}</div></section>` : ""}
${faqs}`, "is-page is-service");
}

function pageTpl(rec) {
  if (rec.path === ABOUT_PATH) return aboutTpl(rec);
  if (rec.path === "/contact-us/") return contactTpl(rec);
  if (SERVICE_PATHS.has(rec.path)) return serviceTpl(rec);
  if (SS && rec.path === SS.path) return successTpl(rec);
  let [eyebrow, h1, body] = splitH1(rec.content_html || "", rec.h1 || rec.title);
  const h1Txt = stripTags(h1);
  const legal = LEGAL.has(rec.path.replace(/^\/+|\/+$/g, ""));
  let lead = "";
  const m = /^\s*<p>([\s\S]*?)<\/p>/.exec(body);
  if (m && !legal && len(m[1].replace(/<[^>]+>/g, "")) < 420) {
    lead = `<p class="lead">${m[1]}</p>`;
    body = body.slice(m[0].length);
  }
  const faqs = contentHasFaq(body, rec.faqs) ? "" : faqBlock(rec.faqs);
  const contact = rec.path === "/contact-us/" ? contactCards() : "";
  const img = rec.featured_image;
  const heroImg = img && !legal ? `<div class="page-hero-img"><img src="${E(rel(img.src))}" alt="${E(img.alt || h1Txt)}" ` +
    `width="${img.width || ""}" height="${img.height || ""}"></div>` : "";
  const crumb = len(rec.title) < 60 ? rec.title : cut(h1Txt, 60);
  return document_(rec, `<section class="page-hero${legal ? " page-hero-sm" : ""}">
  <div class="wrap ${heroImg ? "hero-split" : ""}">
    <div>${breadcrumb(rec.hub ? [["Website Design & Development", rec.hub], [rec.card_title || crumb, null]] : [[crumb, null]])}
    ${eyebrow ? `<span class="eyebrow">${E(eyebrow)}</span>` : ""}
    <h1>${h1}</h1>${lead ? `<!--seo:content-->${lead}<!--/seo:content-->` : ""}
    ${legal ? "" : rec.plan ? `<div class="hero-ctas"><a class="btn btn-primary" href="#brochure">Download the brochure</a><a class="btn btn-ghost" href="/contact-us/">Contact Us</a></div>` : `<div class="hero-ctas"><a class="btn btn-primary" href="${E(CFG.contact.demo_url)}" target="_blank" rel="noopener">Schedule a Free Demo</a><a class="btn btn-ghost" href="/contact-us/">Contact Us</a></div>`}
    </div>${heroImg}
  </div>
</section>
${contact}
<section class="section"><div class="wrap narrow prose"><!--seo:content-->${hubGrids(localizeBody(shape(body, legal)))}<!--/seo:content--></div></section>${rec.plan_shared_html ? `<section class="section plan-shared"><div class="wrap narrow prose">${rec.plan_shared_html}</div></section>` : ""}
${(() => { const k = kitFor(rec, body, legal); return k ? `<section class="section kit"><div class="wrap narrow prose">${localizeBody(k)}</div></section>` : ""; })()}
${rec.plan ? `<section class="section section-alt" id="brochure"><div class="wrap narrow">${brochureForm(rec.plan)}</div></section>` : ""}${cityCompare(rec)}${hubArticles(rec)}${rec.plan ? "" : successCta(rec.path, "section section-alt")}${faqs}`, "is-page" + (legal ? " is-legal" : ""));
}

function related(rec, n = 3) {
  const cats = new Set((rec.categories || []).map((c) => c.path));
  const pool = POSTS.filter((p) => p.path !== rec.path && (p.categories || []).some((c) => cats.has(c.path)));
  // content-plan articles: same hub first, then same cluster
  if (rec.brief_hub) {
    const score = (p) => (p.brief_hub === rec.brief_hub ? 2 : 0) + (p.cluster && p.cluster === rec.cluster ? 1 : 0);
    const near = pool.filter((p) => score(p) > 0).sort((x, y) => score(y) - score(x) || (x.brief_id || 0) - (y.brief_id || 0));
    if (near.length >= n) return near.slice(0, n);
  }
  // prefer non-city articles, oldest first (matches the original ordering)
  pool.sort((a, b) => (a.path.includes("best-seo-agency-in-") - b.path.includes("best-seo-agency-in-")) ||
    (a.date || "").localeCompare(b.date || ""));
  return pool.length ? pool.slice(0, n) : POSTS.filter((p) => p.path !== rec.path).slice(0, n);
}

const noSize = (u) => u.replace(/-\d+x\d+(?=\.\w+$)/, "");

function postTpl(rec) {
  const [eyebrow, h1, body] = splitH1(rec.content_html || "", rec.h1 || rec.title);
  const h1Txt = stripTags(h1);
  const cat = rec.categories?.length ? rec.categories[0] : null;
  const trail = [...(cat ? [[cat.name, cat.path]] : []), [len(h1Txt) < 50 ? h1Txt : cut(h1Txt, 50) + "…", null]];
  const img = rec.featured_image;
  // don't repeat the featured image if the article body already opens with it
  const first = /<img[^>]*src="([^"]+)"/.exec(cut(body, 600));
  const dup = img && first && noSize(rel(first[1])) === noSize(rel(img.src));
  const fig = img && !dup ? `<figure class="post-feature"><img src="${E(rel(img.src))}" alt="${E(img.alt || h1Txt)}" ` +
    `width="${img.width || ""}" height="${img.height || ""}"></figure>` : "";
  const tags = (rec.tags || []).map((t) => `<a class="chip" href="${E(t.path)}">#${E(t.name)}</a>`).join("");
  const faqs = contentHasFaq(body, rec.faqs) ? "" : faqBlock(rec.faqs);
  const relPosts = related(rec).map(postCard).join("");
  return document_(rec, `<article class="post">
  <header class="post-hero"><div class="wrap narrow">
    ${breadcrumb(trail)}
    ${cat ? `<a class="tag" href="${E(cat.path)}">${E(cat.name)}</a>` : ""}
    ${eyebrow ? `<span class="eyebrow">${E(eyebrow)}</span>` : ""}
    <h1>${h1}</h1>
    <div class="post-meta">
      <span>By ${E(rec.author || "Openink Hub")}</span><span>·</span>
      <time datetime="${E(rec.date || "")}">${fmtDate(rec.date || "")}</time><span>·</span>
      <span>${readMinutes(body)} min read</span>
    </div>
  </div></header>
  <div class="wrap narrow">${fig}<div class="prose"><!--seo:content-->${localizeBody(shape(body, false))}<!--/seo:content--></div>
  ${(() => { const k = kitFor(rec, body, false); return k ? `<div class="prose kit">${localizeBody(k)}</div>` : ""; })()}
  ${tags ? `<div class="post-tags">${tags}</div>` : ""}
  <aside class="post-cta"><div><h2>Want results like this for your business?</h2>
  <p>Get a free consultation on SEO, AEO, GEO and AI automation from the Openink Hub team.</p></div>
  <a class="btn btn-primary" href="${E(CFG.contact.demo_url)}" target="_blank" rel="noopener">Book a Free Demo</a></aside>
  </div>
</article>
${cityCompare(rec)}${faqs}
<section class="section section-alt"><div class="wrap"><h2 class="sec-title">Related articles</h2>
<div class="post-grid">${relPosts}</div></div></section>`, "is-post");
}

// Extra content for category pages (hero, topic cards, decision table, steps, FAQ) — content/categories.json
const CATX = fs.existsSync(path.join(C, "categories.json")) ? load(path.join(C, "categories.json")) : {};

/** City guides grouped by state, from content/city-posts (only guides that exist as pages). */
function cityStates() {
  const dir = path.join(C, "city-posts");
  if (!fs.existsSync(dir)) return [];
  const live = new Set(RECS.filter((r) => !r.draft).map((r) => r.path));
  const by = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const j = load(path.join(dir, f));
    for (const c of Array.isArray(j) ? j : [j]) {
      const p = `/${c.file}/`;
      if (!live.has(p)) continue;
      const list = by.get(c.state) || [];
      if (!list.some((x) => x.city === c.city)) list.push({ city: c.city, path: p });
      by.set(c.state, list);
    }
  }
  return [...by.entries()].map(([state, cities]) => ({ state, cities: cities.sort((a, b) => a.city.localeCompare(b.city)) }))
    .sort((a, b) => b.cities.length - a.cities.length || a.state.localeCompare(b.state));
}

function categoryTpl(rec, posts, x, cards, filters) {
  const h1 = rec.h1 || rec.title;
  let alt = false;
  const secOpen = () => ((alt = !alt) ? "section" : "section section-alt");
  const head = (s) => `<div class="sec-head">${s.eyebrow ? `<span class="eyebrow">${E(s.eyebrow)}</span>` : ""}<h2 class="sec-title">${E(s.title)}</h2>${s.lead ? `<div class="sec-lead"><p>${E(s.lead)}</p></div>` : ""}</div>`;
  const link = (l) => `<a href="${E(l[1])}">${E(l[0])}</a>`;
  const ctas = (x.ctas || []).map((c, i) => `<a class="btn ${i ? "btn-ghost" : "btn-primary"}" href="${E(c.href)}">${E(c.label)}${i ? "" : icon("arrow")}</a>`).join("");
  let out = `<section class="hero hero-about hero-service">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap${rec._cover ? " hero-grid" : ""}">
    <div class="hero-copy">${breadcrumb([["Blog", rec.path === "/category/best-seo-content-agency/" ? null : "/category/best-seo-content-agency/"], ...(rec.path === "/category/best-seo-content-agency/" ? [] : [[cut(stripTags(h1), 40), null]])])}
      ${x.eyebrow ? `<span class="eyebrow">${E(x.eyebrow)}</span>` : ""}
      <h1>${E(h1)}</h1>
      <!--seo:content--><p class="lead">${E(x.lead)}</p>${x.quick ? `<div class="quick-answer"><p><strong>Quick answer:</strong> ${E(x.quick)}</p></div>` : ""}<!--/seo:content-->
      <div class="hero-ctas">${ctas}</div>
    </div>
    ${rec._cover ? `<div class="hero-visual"><!--seo:content--><img src="${E(rel(rec._cover.src))}" alt="${E(rec._cover.alt)}" width="1200" height="630" fetchpriority="high"><!--/seo:content--></div>` : ""}
  </div>
</section>`;
  // stats, the shared "Next step" cards and the state list on the SEO page are site-wide boilerplate/navigation:
  // shown, but kept outside <!--seo:content--> so they do not count towards content overlap between categories
  if (x.stats?.length) out += `<section class="section section-tight"><div class="wrap"><ul class="about-stats figures">${x.stats.map((s) => `<li><span>${E(s.label)}</span><b>${E(s.value)}</b></li>`).join("")}</ul></div></section>`;
  const b = x.browse || { title: "All articles" };
  out += `<section class="${secOpen()}"><div class="wrap"><!--seo:content-->${head(b)}<!--/seo:content--><div class="chips">${filters}</div><div class="post-grid">${cards}</div></div></section>`;
  if (x.states) {
    const st = cityStates();
    const own = rec.path === "/category/seo-agency-by-city/";
    out += `<section class="${secOpen()}"><div class="wrap">${own ? "<!--seo:content-->" : ""}${head({ eyebrow: "By state", title: "Find your city by state", lead: `${st.reduce((t, s) => t + s.cities.length, 0)} cities in ${st.length} states and union territories.` })}
<div class="svc-grid svc-cards-auto state-grid">${st.map((s) => `<article class="svc-card"><span class="card-tag">${s.cities.length} ${s.cities.length === 1 ? "guide" : "guides"}</span><h3>${E(s.state)}</h3><p class="state-cities">${s.cities.map((c) => `<a href="${E(c.path)}">${E(c.city)}</a>`).join(" · ")}</p></article>`).join("")}</div>${own ? "<!--/seo:content-->" : ""}</div></section>`;
  }
  for (const s of x.sections || []) {
    let body = "";
    if (s.cards) body = `<div class="svc-grid svc-cards-auto">${s.cards.map((c) => `<article class="svc-card"><h3>${E(c.title)}</h3><p>${E(c.text)}</p>${c.links ? `<ul class="card-links">${c.links.map((l) => `<li>${link(l)}</li>`).join("")}</ul>` : ""}</article>`).join("")}</div>`;
    else if (s.table) body = `<div class="c-card"><div class="table-wrap"><table><thead><tr>${s.table.head.map((h) => `<th>${E(h)}</th>`).join("")}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((c, k) => `<td>${k ? c : `<strong>${E(c)}</strong>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
    else if (s.lessons) body = `<div class="svc-grid svc-cards-auto lesson-grid">${s.lessons.map((l) => `<a class="svc-card svc-link" href="${E(l.href)}"><span class="num">${E(l.n)}</span><h3>${E(l.title)}</h3><p>${E(l.text)}</p><span class="link-arrow">Start lesson${icon("arrow")}</span></a>`).join("")}</div>`;
    else if (s.steps) body =`<ol class="steps">${s.steps.map((t) => `<li>${E(t)}</li>`).join("")}</ol>`;
    const shared = s.eyebrow === "Next step";
    out += `<section class="${secOpen()}"><div class="wrap${s.steps ? " narrow" : ""}">${shared ? "" : "<!--seo:content-->"}${head(s)}${body}${shared ? "" : "<!--/seo:content-->"}</div></section>`;
  }
  if (rec.faqs?.length) out += `<section class="${secOpen()}"><div class="wrap narrow"><!--seo:content-->${head({ eyebrow: "FAQ", title: "Frequently Asked Questions" })}<div class="faq-list">${rec.faqs.map((f) => `<div class="faq-card"><h3>${E(stripTags(f.q))}</h3><div class="faq-a">${localizeBody(f.a)}</div></div>`).join("")}</div><!--/seo:content--></div></section>`;
  return document_(rec, out, "is-archive is-service is-category");
}

function listingTpl(rec, posts, label) {
  const intro = (rec.content_html || "").replace(/<[^>]+>/g, " ").trim();
  const h1 = rec.h1 || rec.title;
  // images on the first cards only (the rest are text cards), so big archives stay light
  const maxImg = Math.max(0, (RULES.thresholds.pageWeight.maxImagesPerPage || 30) - 6);
  const cards = posts.map((p, i) => postCard(i < maxImg ? p : { ...p, featured_image: null })).join("") || "<p>No articles yet.</p>";
  const months = RECS.filter((r) => r.type === "archive").sort((a, b) => b.path.localeCompare(a.path));
  const filters = CATS.filter((c) => c.count).map((c) =>
    `<a class="chip${c.path === rec.path || (rec.path === "/category/seo-agency-by-city/" && c.slug === "seo-services") ? " is-on" : ""}" href="${E(c.path)}">${E(c.name)}</a>`).join("") +
    months.map((m) => `<a class="chip${m.path === rec.path ? " is-on" : ""}" href="${E(m.path)}">${E(listingLabel(m))}</a>`).join("");
  if (CATX[rec.path]) return categoryTpl(rec, posts, CATX[rec.path], cards, filters);
  return document_(rec, `<!--seo:content--><section class="page-hero page-hero-sm"><div class="wrap">
  ${breadcrumb([[label, null], [h1, null]])}
  <h1>${E(h1)}</h1>
  <p class="lead">${posts.length} article${posts.length !== 1 ? "s" : ""}${intro && len(intro) < 400 ? " · " + E(cut(intro, 200)) : ""}</p>
  <p>Guides from Openink Hub in Ranchi on SEO, AEO, GEO and AIO, Google Business Profile, WhatsApp automation and growing your business online.</p>
  <div class="chips">${filters}</div>
</div></section><!--/seo:content-->
<section class="section"><div class="wrap"><div class="post-grid">${cards}</div></div></section>`, "is-archive");
}

/** Replace <!--hub:NAME--> with a card grid of the guides in content/articles/NAME.json.
 *  Published guides are linked; drafts show "Coming soon" (no link, so search engines never find thin pages). */
function hubGrids(html) {
  return html.replace(/<!--hub:([a-z0-9-]+)-->/g, (m, name) => {
    const f = path.join(C, "articles", `${name}.json`);
    if (!fs.existsSync(f)) return "";
    const items = load(f).items;
    const byPath = new Map(RECS.map((r) => [r.path, r]));
    return `<div class="guide-grid">${items.map((a) => {
      const rec = byPath.get(`/${a.slug}/`);
      const live = rec && !rec.draft;
      const inner = `<span class="g-n">${E(a.n)}</span><h3>${E(a.card_title)}</h3><span class="g-t">${E(a.card_text)}</span>` +
        `<span class="g-s">${live ? "Read the guide →" : "Coming soon"}</span>`;
      return live ? `<a class="guide-card" href="/${E(a.slug)}/">${inner}</a>` : `<div class="guide-card is-soon">${inner}</div>`;
    }).join("")}</div>`;
  });
}

function contactCards() {
  const c = CFG.contact;
  const cards = [["phone", "Call us", c.phone, `tel:${c.phone_raw}`],
    ["mail", "Email", c.email, `mailto:${c.email}`], ["map", "Visit", c.address, c.map_url || "#"]];
  return '<section class="section section-tight"><div class="wrap contact-grid">' + cards.map(([i, t, v, h]) =>
    `<a class="contact-card" href="${E(h)}"${h.startsWith("http") ? " target=_blank rel=noopener" : ""}>` +
    `${icon(i)}<strong>${E(t)}</strong><span>${E(v)}</span></a>`).join("") + "</div></section>";
}

// "Our recent work" cards (content/home.json work): on the home page and on matching service pages (work.pages)
function workSection(W, items) {
  if (!items?.length) return "";
  return `<section class="${W.cls || "section section-alt"}" id="${W.id || "recent-work"}"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">${E(W.eyebrow)}</span><h2 class="sec-title">${E(W.h2)}</h2><p>${E(W.intro)}</p></div>
  <div class="work-grid">${items.map((w) => `<article class="work-card">
    <a class="work-shot" href="${E(w.url)}" target="_blank" rel="noopener" aria-label="Visit the ${E(w.name)} website"><img src="${E(w.img)}"${srcsetAttr(w.img, [640], 1280, SIZES.work)} alt="${E(w.alt)}" width="1280" height="800" loading="lazy" decoding="async"></a>
    <div class="work-body"><span class="tag">${E(w.industry)}</span><h3>${E(w.name)}</h3><p>${E(w.text)}</p>
    <ul class="work-services">${w.services.map((s) => `<li>${E(s)}</li>`).join("")}</ul>
    ${w.pagespeed ? (() => {
      // PageSpeed-style gauges: ring filled to the score; green 90-100, orange 50-89, red 0-49; DA in brand blue
      const kpis = [["performance", "Performance"], ["accessibility", "Accessibility"], ["best_practices", "Best Practices"], ["seo", "SEO"], ["pa", "Page Authority"], ["rd", "Referring Domains"]]
        .filter(([k]) => w.pagespeed[k] != null && (!["pa", "rd"].includes(k) || w.pagespeed[k] > 0));
      const C = 2 * Math.PI * 24;
      const ring = (k, l, v) => {
        // scores 0-100 fill the ring to their value; referring domains is a count, so its ring is a plain circle
        const cls = k === "pa" ? "is-da" : k === "rd" ? "is-count" : v >= 90 ? "is-good" : v >= 50 ? "is-ok" : "is-poor";
        const arc = k === "rd" ? "" : `<circle class="kpi-arc" cx="28" cy="28" r="24" stroke-dasharray="${(C * Math.min(v, 100) / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)"/>`;
        return `<div class="kpi ${cls}"><svg viewBox="0 0 56 56" aria-hidden="true"><circle class="kpi-bg" cx="28" cy="28" r="24"/>${arc}<text x="28" y="33" text-anchor="middle">${v}</text></svg><span>${l}</span></div>`;
      };
      return `<div class="work-kpis kpi-n${kpis.length}" role="img" aria-label="${E(w.name)}: ${kpis.map(([k, l]) => `${l} ${w.pagespeed[k]}`).join(", ")}">${kpis.map(([k, l]) => ring(k, l, w.pagespeed[k])).join("")}</div>`;
    })() : ""}
    <a class="link-arrow" href="${E(w.url)}" target="_blank" rel="noopener">Visit ${E(w.url.replace(/^https?:\/\/(www\.)?|\/$/g, ""))}${icon("arrow")}</a></div>
  </article>`).join("")}</div>
  ${items.some((w) => w.pagespeed) ? `<p class="work-note">Scores: ${E(HOME.work.scores_note || "Google PageSpeed Insights")}.</p>` : ""}
  ${W.cta ? `<div class="work-cta"><a class="btn btn-primary" href="${E(W.cta.href)}">${E(W.cta.label)}${icon("arrow")}</a></div>` : ""}
</div></section>`;
}
function workForPage(path, cls = "section section-alt") {
  const P = HOME.work?.pages?.[path];
  if (!P) return "";
  const items = HOME.work.items.filter((w) => P.projects.includes(w.name));
  return workSection({ ...HOME.work, ...P, cls: cls + " work-on-service", id: "client-work" }, items);
}

// "Our Success Stories": keyword-anchor link to a site (the URL itself is never shown)
const ssLink = (s, arrow = true) => `<a class="ss-anchor" href="${E(s.url)}" target="_blank" rel="noopener">${E(s.anchor)}${arrow ? icon("arrow") : ""}</a>`;
// CTA band on the home page and matching service pages (success-stories.json cta.pages), with 3 keyword links of the page's themes
function successCta(p, cls = "section") {
  const C = SS?.cta, P = C?.pages?.[p];
  if (!P || p === SS.path) return "";
  const picks = [];
  for (const t of P.themes) for (const s of SS.sites) if (s.category === t && !picks.includes(s) && picks.length < 3 && !picks.some((x) => x.name === s.name)) picks.push(s);
  return `<section class="${cls} ss-cta-band" id="success-stories"><div class="wrap"><div class="ss-cta">
  <div class="ss-cta-copy"><span class="eyebrow">${E(C.eyebrow)}</span><h2 class="sec-title">${E(C.h2)}</h2><p>${E(C.text)}</p>
  <ul class="ss-cta-stats">${SS.stats.slice(0, 3).map((s) => `<li><b>${E(s.value)}</b><span>${E(s.label)}</span></li>`).join("")}</ul>
  <a class="btn btn-primary" href="${E(SS.path)}">${E(C.label)}${icon("arrow")}</a></div>
  ${picks.length ? `<div class="ss-cta-links"><strong>From the websites we built</strong><ul>${picks.map((s) => `<li><span class="tag">${E(s.category)}</span>${ssLink(s)}<small>${E(s.name)}: ${E(s.positioning)}</small></li>`).join("")}</ul></div>` : ""}
</div></div></section>`;
}
// hero screenshot of a site (tools/shoot-sites.mjs -> static/images/success/<host>.webp); a branded tile when there is none yet
const ssShotFile = (url) => new URL(url).hostname.replace(/^www./, "").replace(/[^a-z0-9.-]/gi, "-") + ".webp";
const ssShot = (s) => {
  const f = "/images/success/" + ssShotFile(s.url);
  return fs.existsSync(path.join(ROOT, "static", ...f.split("/").filter(Boolean)))
    ? `<div class="ss-shot"><img src="${f}" alt="Home page of ${E(s.name)} (${E(s.edition.toLowerCase())})" width="640" height="400" loading="lazy" decoding="async"></div>`
    : `<div class="ss-shot ss-ph" aria-hidden="true"><b>${E(s.name)}</b><span>New content coming soon</span></div>`;
};
function successTpl(rec) {
  const S = SS, st = S.stack, N = S.network;
  const cats = [...new Set(S.sites.map((s) => s.category))].sort();
  const cards = S.sites.map((s) => `<article class="ss-card" data-cat="${E(s.category)}">
    ${ssShot(s)}
    <div class="ss-card-top"><span class="tag">${E(s.category)}</span><span class="ss-built">${E(s.built || "WordPress")}</span></div>
    <h3>${E(s.name)} <small class="ss-ed">${E(s.edition)}</small></h3><p>${E(s.positioning)}. For ${E(s.audience.toLowerCase())}.</p>
    <p class="ss-kw"><span>Target keyword</span>${ssLink(s, false)}</p></article>`).join("");
  return document_(rec, `<section class="hero hero-about hero-service">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">${breadcrumb([[rec.title, null]])}
      <span class="eyebrow">${E(S.eyebrow)}</span>
      <h1>${E(S.h1)}</h1>
      <!--seo:content--><p class="lead">${E(S.lead)}</p><!--/seo:content-->
      <div class="hero-ctas"><a class="btn btn-primary" href="#site-network">Browse All Sites${icon("arrow")}</a><a class="btn btn-ghost" href="/contact-us/">Contact Us</a></div>
    </div>
    <div class="hero-visual"><!--seo:content--><img src="${E(rec.featured_image.src)}" alt="${E(rec.featured_image.alt)}" width="1280" height="800" fetchpriority="high"><!--/seo:content--></div>
  </div>
</section>
<section class="section section-tight"><div class="wrap"><ul class="about-stats figures">${S.stats.map((s) => `<li><b>${E(s.value)}</b><span>${E(s.label)}</span></li>`).join("")}</ul></div></section>
<!--seo:content--><section class="section"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">${E(st.eyebrow)}</span><h2 class="sec-title">${E(st.h2)}</h2><p>${st.intro_html}</p></div>
  <div class="ss-stack">${st.cards.map((c) => `<article class="svc-card"><div class="svc-ico">${icon(c.icon)}</div><h3>${E(c.title)}</h3><ul class="ss-list">${c.items.map((i) => `<li>${icon("check")}<span>${E(i)}</span></li>`).join("")}</ul></article>`).join("")}</div>
</div></section>
<!--/seo:content-->${workSection({ ...HOME.work, ...S.featured, id: "featured-work", cta: null }, HOME.work.items)}<!--seo:content-->
<section class="section" id="site-network"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">${E(N.eyebrow)}</span><h2 class="sec-title">${E(N.h2)}</h2><p>${E(N.intro)}</p></div><!--/seo:content-->
  <div class="ss-tools"><label class="ss-search"><span>Search sites</span><input type="search" id="ss-q" placeholder="Keyword, industry or audience" autocomplete="off"></label>
  <label class="ss-filter"><span>Theme</span><select id="ss-cat"><option value="">All themes (${cats.length})</option>${cats.map((c) => `<option>${E(c)}</option>`).join("")}</select></label>
  <p class="ss-count" id="ss-count" aria-live="polite">Showing ${S.sites.length} of ${S.sites.length} sites</p></div>
  <div class="ss-grid" id="ss-grid">${cards}</div>
</div></section>
<!--seo:content--><section class="section section-alt"><div class="wrap narrow center"><h2 class="sec-title">${E(S.closing.h2)}</h2><p>${E(S.closing.text)}</p>
  <a class="btn btn-primary" href="${E(S.closing.href)}">${E(S.closing.label)}${icon("arrow")}</a></div></section>${faqBlock(rec.faqs)}<!--/seo:content-->
<script>(function(){var q=document.getElementById("ss-q"),c=document.getElementById("ss-cat"),n=document.getElementById("ss-count"),cards=[].slice.call(document.querySelectorAll(".ss-card"));
function f(){var v=q.value.trim().toLowerCase(),k=c.value,shown=0;cards.forEach(function(e){var ok=(!k||e.getAttribute("data-cat")===k)&&(!v||e.textContent.toLowerCase().indexOf(v)>-1);e.hidden=!ok;if(ok)shown++;});n.textContent="Showing "+shown+" of "+cards.length+" sites";}
q.addEventListener("input",f);c.addEventListener("change",f);})();</script>`, "is-page is-service is-success");
}

function homeTpl(rec) {
  // plain words on the home page too (home.json is not a page record), keeping the home keyphrase
  if (RULES.autofix.simpleWords && !HOME._simple) {
    const keep = [rec.keyphrase, ...(rec.keyphrase_secondary || [])].filter(Boolean);
    const walk = (o) => { for (const [k, v] of Object.entries(o)) { if (k === "_note" || /^(href|url|link|src|path|icon|img|image)$/i.test(k)) continue; if (typeof v === "string") { if (!/^(\/|https?:|#|mailto:|tel:)/.test(v)) o[k] = simplifyHtml(v, keep); } else if (v && typeof v === "object") walk(v); } };
    walk(HOME); HOME._simple = true;
  }
  const H = HOME, hero = H.hero;
  const ext = (h) => (h.startsWith("http") ? " target=_blank rel=noopener" : "");
  const ctas = hero.ctas.map((c) => `<a class="btn btn-${c.style}" href="${E(c.href)}"${ext(c.href)}>${E(c.label)}${c.style === "primary" ? icon("arrow") : ""}</a>`).join("");
  const services = H.services.items.map((s) => `<article class="svc-card"><div class="svc-ico">${icon(s.icon)}</div><h3>${E(s.title)}</h3>
<p>${E(s.text)}</p><a class="link-arrow" href="${E(s.href)}">${E(s.cta)}${icon("arrow")}</a></article>`).join("");
  const era = H.era.items.map((x, i) => `<div class="era-item"><span class="num">0${i + 1}</span><h3>${E(x.title)}</h3><p>${E(x.text)}</p></div>`).join("");
  const missionItems = H.mission.items.map((x) => `<li>${icon("check")}<div><strong>${E(x.title)}</strong><span>${E(x.text)}</span></div></li>`).join("");
  const testi = H.testimonials.items.map((t) => `<figure class="quote"><blockquote>“${E(t.quote)}”</blockquote><figcaption>` +
    `<img src="${E(t.img)}" alt="${E(t.name)}" loading="lazy" width="48" height="48"><strong>${E(t.name)}</strong></figcaption></figure>`).join("");
  const wa = H.whatsapp.items.map((x) => `<div class="wa-item">${icon("check")}<div><h3>${E(x.title)}</h3><p>${E(x.text)}</p></div></div>`).join("");
  const logos = H.clients.logos.map((l) => `<img src="${E(logoSrc(l.img))}" alt="${E(l.name)} logo" width="64" height="64" loading="lazy" decoding="async">`).join("");
  const sol = H.solutions.links.map((l) => `<a class="sol-link" href="${E(l.href)}">${E(l.label)}${icon("arrow")}</a>`).join("");
  const faqItems = RULES.autofix.plainFaq ? `<div class="faq-list">${H.faq.items.map((f) => `<div class="faq-card"><h3>${E(f.q)}</h3><div class="faq-a"><p>${f.a}</p></div></div>`).join("")}</div>`
    : H.faq.items.map((f) => `<details class="faq"><summary>${E(f.q)}</summary><div class="faq-a"><p>${f.a}</p></div></details>`).join("");
  const latest = POSTS.filter((p) => !p.path.includes("best-seo-agency-in-")).slice(0, 3).map(postCard).join("");
  const blogCat = CATS.find((c) => c.slug === "best-seo-content-agency")?.path || "/";
  return document_(rec, (RULES.autofix.linkText ? (h) => fixLinks(h, titleOf) : (h) => h)(`<!--seo:content--><section class="hero">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">${E(hero.eyebrow)}</span>
      <h1>${E(hero.h1)}</h1>
      <p class="lead">${E(hero.lead)}</p>
      <div class="hero-ctas">${ctas}</div>
      <div class="quick-answer"><strong>Quick answer:</strong> ${E(hero.quick_answer)}</div>
      ${hero.takeaways?.length ? `<div class="key-takeaways"><strong>Key takeaways</strong><ul>${hero.takeaways.map((t) => `<li>${icon("check")}<span>${E(t)}</span></li>`).join("")}</ul></div>` : ""}
    </div>
    <div class="hero-visual">
      <img src="${E(hero.image.src)}"${heroSet(hero.image.src)} alt="${E(hero.image.alt)}" width="1024" height="576" fetchpriority="high">
      <div class="engines"><span>Google</span><span>ChatGPT</span><span>Gemini</span><span>Perplexity</span></div>
    </div>
  </div>
</section>
<section class="logo-strip" aria-label="Clients"><div class="wrap"><p>${E(H.clients.h2)}</p><div class="marquee"><div class="marquee-track">${logos}${logos}</div></div></div></section>
<section class="section" id="services"><div class="wrap">
  <div class="sec-head"><h2 class="sec-title">${E(H.services.h2)}</h2><p>${E(H.services.intro)}</p></div>
  <div class="svc-grid">${services}</div>
</div></section>
${workSection(H.work || {}, H.work?.items)}
${successCta("/")}
<section class="section section-dark"><div class="wrap">
  <div class="sec-head"><span class="eyebrow eyebrow-light">The Tipping Point of the Modern AI Era</span><h2 class="sec-title">${E(H.era.h2)}</h2><p>${E(H.era.intro)}</p></div>
  <div class="era-grid">${era}</div>
</div></section>
<section class="section"><div class="wrap split">
  <div><h2 class="sec-title">${E(H.mission.h2)}</h2>${H.mission.paras.map((p) => `<p>${E(p)}</p>`).join("")}</div>
  <ul class="check-list">${missionItems}</ul>
</div></section>
<section class="section"><div class="wrap platform">
  <div><h2 class="sec-title">${E(H.platform.h2)}</h2><p>${E(H.platform.text)}</p>
  <a class="btn btn-primary" href="${E(H.platform.cta.href)}">${E(H.platform.cta.label)}${icon("arrow")}</a></div>
  <div class="sol-grid"><h3>${E(H.solutions.h2)}</h3><p>${E(H.solutions.text)}</p><div class="sol-links">${sol}</div></div>
</div></section>
<section class="section section-wa"><div class="wrap split">
  <div><span class="eyebrow">WhatsApp AI ChatBot</span><h2 class="sec-title">${E(H.whatsapp.h2)}</h2>
  <a class="btn btn-primary" href="${E(H.whatsapp.cta.href)}">${E(H.whatsapp.cta.label)}${icon("arrow")}</a></div>
  <div class="wa-list">${wa}</div>
</div></section>
<section class="section section-alt"><div class="wrap">
  <div class="sec-head"><h2 class="sec-title">${E(H.testimonials.h2)}</h2></div>
  <div class="quote-grid">${testi}</div>
</div></section>
<section class="section"><div class="wrap">
  <div class="sec-head sec-head-row"><h2 class="sec-title">Latest insights</h2><a class="link-arrow" href="${E(blogCat)}">All articles${icon("arrow")}</a></div>
  <div class="post-grid">${latest}</div>
</div></section>
<section class="section section-alt"><div class="wrap narrow"><h2 class="sec-title">${E(H.faq.h2)}</h2>${faqItems}</div></section><!--/seo:content-->`) + (() => { const k = kitFor(rec, "", false); return k ? `<section class="section kit"><div class="wrap narrow prose">${k}</div></section>` : ""; })(), "is-home");
}

// ---------------------------------------------------------------- output
function write(p, text) {
  let target = path.join(DIST, ...p.replace(/^\/+/, "").split("/"));
  if (p.endsWith("/")) target = path.join(target, "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (target.endsWith(".html")) {
    const fx = fixHtml(text, DIST, (/<title>([^<]*)<\/title>/.exec(text) || [])[1] || "");
    text = fx.html;
    if (fx.fixes.length) HTML_FIXES[p] = [...new Set(fx.fixes)].map((f) => `${f}:${fx.fixes.filter((x) => x === f).length}`);
  }
  fs.writeFileSync(target, text, "utf8");
}

function sitemaps() {
  const KIND = { home: "home", post: "posts", page: "pages", category: "categories", tag: "tags", archive: "archives" };
  const groups = {};
  for (const r of RECS) {
    if (r.head.meta.some((m) => m.key === "robots" && m.content.includes("noindex"))) continue;
    (groups[KIND[r.type] || "pages"] ||= []).push(r);
  }
  const stamp = now.toISOString().slice(0, 19) + "+00:00";
  const idx = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  const listed = [];
  for (const name of ["home", "posts", "pages", "categories", "tags", "archives"]) {
    const rows = [...(groups[name] || [])].sort((a, b) => (b.lastmod || "").localeCompare(a.lastmod || ""));
    const urls = rows.map((r) => {
      const lm = r.lastmod || r.modified ? `<lastmod>${E(r.lastmod || (r.modified || "") + "+00:00")}</lastmod>` : "";
      return `<url><loc>${E(r.path !== "/" ? r.url : BASE + "/")}</loc>${lm}</url>\n`;
    }).join("");
    write(`/sitemap-${name}.xml`, '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n");
    // empty sitemaps (e.g. archives, now retired) stay reachable but are not listed, so Search Console reports no empty file
    if (rows.length) { idx.push(`<sitemap><loc>${BASE}/sitemap-${name}.xml</loc><lastmod>${stamp}</lastmod></sitemap>`); listed.push(name); }
  }
  idx.push("</sitemapindex>\n");
  write("/sitemap.xml", idx.join("\n"));
  write("/sitemap_index.xml", idx.join("\n")); // was live on WordPress too
  write("/robots.txt", "User-agent: *\nAllow: /\n" + (RULES.autofix.robotsDisallowAdmin ? "Disallow: /admin/\n" : "") + "\n" + ["", ...listed]
    .map((n) => `Sitemap: ${BASE}/sitemap${n ? "-" + n : ""}.xml\n`).join(""));
}

function notFound() {
  const rec = { path: "/404", head: { title: "Page not found | openink Hub", lang: "en-US", links: [], jsonld: [],
    meta: [{ attr: "name", key: "robots", content: "noindex,follow" }] } };
  const latest = POSTS.slice(0, 3).map(postCard).join("");
  write("/404.html", document_(rec, `<section class="page-hero"><div class="wrap narrow center">
<span class="eyebrow">Error 404</span><h1>We couldn’t find that page</h1>
<p class="lead">The link may be outdated. Try one of our services or the latest articles below.</p>
<div class="hero-ctas center"><a class="btn btn-primary" href="/">Back to home</a><a class="btn btn-ghost" href="/best-seo-services-in-india/">Our services</a></div>
</div></section><section class="section"><div class="wrap"><div class="post-grid">${latest}</div></div></section>`));
}

/** _redirects (from Squirrly), _headers (security + noindex for /admin), llms.txt (for AI crawlers). */
function seoFiles() {
  const retiredFile = path.join(C, "seo", "retired.json");
  const retired = fs.existsSync(retiredFile) ? load(retiredFile).redirects || [] : [];
  if ((RULES.autofix.redirects && SQUIRRLY.redirects?.length) || retired.length) {
    const lines = (RULES.autofix.redirects ? SQUIRRLY.redirects || [] : []).flatMap((r) => [`${r.from} ${r.to} ${r.code}`, `${r.from}/ ${r.to} ${r.code}`]);
    const ret = [...new Set(retired.flatMap((r) => [`${r.from} ${r.to} ${r.code}`, `${r.from.replace(/\/$/, "")} ${r.to} ${r.code}`]))];
    write("/_redirects", "# Imported from Squirrly SEO (content/seo/squirrly.json). Live URLs are never redirected.\n" + lines.join("\n") + "\n" +
      (ret.length ? "# Retired on purpose (content/seo/retired.json)\n" + ret.join("\n") + "\n" : ""));
  }
  if (RULES.autofix.securityHeaders) {
    write("/_headers", [
      "/*", "  X-Content-Type-Options: nosniff", "  Referrer-Policy: strict-origin-when-cross-origin",
      "  X-Frame-Options: SAMEORIGIN", "  Permissions-Policy: camera=(), microphone=(), geolocation=()", "",
      "/admin/*", "  X-Robots-Tag: noindex, nofollow", "  Cache-Control: no-store", "",
      "/assets/*", "  Cache-Control: public, max-age=31536000, immutable", "",
      "/wp-content/uploads/*", "  Cache-Control: public, max-age=2592000", "",
    ].join("\n"));
  }
  if (RULES.autofix.llmsTxt) {
    const plain = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const indexable = RECS.filter((r) => !r.head.meta.some((m) => m.key === "robots" && /noindex/.test(m.content)));
    const isCity = (r) => (r.categories || []).some((c) => c.path === "/category/seo-agency-by-city/");
    const line = (r) => `- [${plain(r.head.title)}](${BASE}${r.path}): ${plain((r.head.meta.find((m) => m.key === "description") || {}).content || r.excerpt).slice(0, 160)}`;
    const group = (label, list) => (list.length ? [`\n## ${label}\n`, ...list.map(line)] : []);
    write("/llms.txt", [
      "# openink Hub", "",
      "> AI-powered growth engine for startups and SMEs in India: SEO, answer engine optimization (AEO), generative engine optimization (GEO), artificial intelligence optimization (AIO), WhatsApp AI automation, Google Business Profile optimization and AI voice agents. Based in Ranchi, Jharkhand.",
      "", `Contact: ${CFG.contact.email} · ${CFG.contact.phone} · ${CFG.contact.address}`,
      ...group("Services and key pages", indexable.filter((r) => ["home", "page"].includes(r.type))),
      ...group("Guides and articles", indexable.filter((r) => r.type === "post" && !isCity(r))),
      ...group("Website development guides", indexable.filter((r) => r.type === "guide")),
      ...group("SEO city guides", indexable.filter(isCity)),
      ...group("Topics and archives", indexable.filter((r) => ["category", "tag", "archive"].includes(r.type))),
    ].join("\n") + "\n");
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

// Pages and guides with no image in their content get a branded title card (static/images/pages/<slug>.svg),
// placed after the lead paragraph so it counts as a content image (hero_image + text_image_ratio checks).
const NO_COVER = new Set([]);
function addCovers() {
  for (const r of RECS) {
    const slug = r.path.replace(/^\/+|\/+$/g, "");
    // category / tag pages with their own copy get a cover for the hero (counts as a content image)
    if (["category", "tag"].includes(r.type) && CATX[r.path]) {
      r._cover = makeCover({ dir: "categories", slug: slug.replace(/\//g, "-"), title: stripTags(CATX[r.path].h1 || r.h1 || r.title || ""), label: r.type === "tag" ? "Openink Hub guides" : "Openink Hub blog" });
      continue;
    }
    if (!["page", "guide"].includes(r.type) || !slug || r.draft || LEGAL.has(slug) || NO_COVER.has(slug)) continue;
    if (/<img\b/.test(r.content_html || "")) continue;
    const h1 = stripTags(r.h1 || r.title || "");
    const title = h1.length <= 90 ? h1 : stripTags(r.head?.title || r.title || h1).replace(/\s*[|–-]\s*openink Hub$/i, "");
    const img = makeCover({ dir: "pages", slug, title, label: r.type === "guide" ? "Website development guide" : "openink Hub" });
    const fig = coverFigure(img);
    // after the first paragraph that follows the H1 (that paragraph becomes the hero lead)
    r.content_html = r.content_html.replace(/(<\/h1>\s*(?:<p>[\s\S]*?<\/p>)?)/, `$1\n${fig}\n`);
    if (!r.content_html.includes(fig)) r.content_html = fig + "\n" + r.content_html;
  }
}

// Service pages with fewer than 3 internal links in their content get a short "Related services" list
// (closest topics first, by shared title words), so visitors and crawlers can move between services.
const RELATED_POOL = (RULES.related_services || []).map((x) => ({ ...x, words: new Set(x.topic.toLowerCase().split(/\W+/)) }));
function addRelatedLinks() {
  const min = RULES.thresholds.internalLinks.min;
  for (const r of RECS) {
    const slug = r.path.replace(/^\/+|\/+$/g, "");
    if (r.type !== "page" || !slug || LEGAL.has(slug) || NO_COVER.has(slug)) continue;
    const have = new Set([...(r.content_html || "").matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]));
    if (have.size >= min) continue;
    const mine = new Set(stripTags(`${r.title} ${r.h1}`).toLowerCase().split(/\W+/));
    const picks = RELATED_POOL.filter((x) => x.path !== r.path && !have.has(x.path))
      .map((x) => ({ x, s: [...x.words].filter((w) => w.length > 2 && mine.has(w)).length }))
      .sort((a, b) => b.s - a.s).slice(0, 4).map(({ x }) => x);
    r.content_html += `\n<h2>Related services</h2>\n<ul>${picks.map((x) => `<li><a href="${x.path}">${E(x.label)}</a></li>`).join("")}</ul>`;
  }
}

// Every blog post / guide links to its matching service page (rules.json service_links). If the content has no link
// to any of the expected services, one short line is added before the FAQ (or at the end).
const serviceFor = (r) => {
  const SL = RULES.service_links || {};
  if (SL.posts?.[r.path]) return SL.posts[r.path];
  const c = (r.categories || []).find((x) => SL.categories?.[x.path]);
  return c ? SL.categories[c.path] : null;
};
function addServiceLinks() {
  const SL = RULES.service_links || {};
  for (const r of RECS) {
    if (!["post", "guide"].includes(r.type) || r.draft) continue;
    const want = serviceFor(r);
    if (!want?.length) continue;
    const html = r.content_html || "";
    if (want.some((s) => html.includes(`href="${s}"`) || html.includes(`href="${BASE}${s}"`))) continue;
    const s = want[0], label = SL.labels?.[s] || stripTags(r.title);
    const line = `<p class="service-link">Want expert help with this? Our <a href="${s}">${E(label)}</a> team can do it for you, starting with a free audit.</p>`;
    const at = html.search(/<h2[^>]*>\s*(Frequently asked questions|Often asked questions|FAQs?)\b/i);
    r.content_html = at > 0 ? html.slice(0, at) + line + "\n" + html.slice(at) : html + "\n" + line;
  }
}

function main() {
  if (COPY_MISSES.length) { console.error("copy-edits.json: text not found (page changed?)\n  " + COPY_MISSES.join("\n  ")); process.exit(1); }
  addCovers();
  addRelatedLinks();
  addServiceLinks();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "static"), DIST, { recursive: true });
  const byCat = {}, byTag = {}, byMonth = {};
  // published website development guides (type "guide") are listed in their categories too, newest first
  const LISTED = [...POSTS, ...RECS.filter((r) => r.type === "guide" && !r.draft && r.categories?.length)]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const p of LISTED) {
    for (const c of p.categories || []) (byCat[c.path] ||= []).push(p);
    for (const t of p.tags || []) (byTag[t.path] ||= []).push(p);
    if (p.date) (byMonth[`/${p.date.slice(0, 4)}/${p.date.slice(5, 7)}/`] ||= []).push(p);
  }
  for (const r of RECS) {
    const out = r.type === "home" ? homeTpl(r)
      : r.type === "post" ? postTpl(r)
      : r.type === "category" ? listingTpl(r, byCat[r.path] || [], "Category")
      : r.type === "tag" ? listingTpl(r, byTag[r.path] || [], "Tag")
      : r.type === "archive" ? listingTpl(r, byMonth[r.path] || [], "Archive")
      : pageTpl(r);
    BROCHURE_JS = false;
    write(r.path, seoCta(r.path, fixAnchors(planMarkers(out))));
  }
  sitemaps();
  notFound();
  write("/CNAME", "openinkhub.io\n");
  if (ADSENSE) write("/ads.txt", `google.com, ${ADSENSE.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
  write("/.nojekyll", "");
  seoFiles();
  fs.mkdirSync(path.join(DIST, "admin"), { recursive: true });
  fs.writeFileSync(path.join(DIST, "admin", "html-fixes.json"), JSON.stringify(HTML_FIXES));

  // sanity: every referenced local asset exists
  const missing = new Set();
  for (const f of walk(DIST).filter((f) => f.endsWith(".html"))) {
    for (const [, src] of fs.readFileSync(f, "utf8").matchAll(/(?:src|href)="(\/wp-content\/[^"?#]+)"/g)) {
      if (!fs.existsSync(path.join(DIST, ...src.slice(1).split("/")))) missing.add(src);
    }
  }
  console.log(`built ${RECS.length} URLs into dist/  (${POSTS.length} posts)`);
  if (missing.size) console.log(`WARNING ${missing.size} referenced assets missing, e.g.:\n  ` + [...missing].sort().slice(0, 10).join("\n  "));
}

main();
