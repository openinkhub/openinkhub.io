/**
 * Branded 1200x630 SVG title cards, written to static/images/<dir>/<slug>.svg.
 * Used by brief-posts.mjs, city-posts.mjs and covers-pages.mjs so every page has a relevant image.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://openinkhub.io";
const E = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const wrap = (t, n) => t.split(" ").reduce((ls, w) => {
  const l = ls[ls.length - 1];
  if (l && (l + " " + w).length <= n) ls[ls.length - 1] = l + " " + w; else ls.push(w);
  return ls;
}, []);

/** Write the card and return a featured_image record ({src, alt, width, height}). Same design as makeArticleCover. */
export function makeCover({ dir, slug, title, label, icon }) {
  return makeArticleCover({ dir, slug, title, label, accentKey: label.replace(/ · [^·]+$/, ""), icon: icon || (dir === "city" ? "pin" : undefined) });
}

// ---------------------------------------------------------------- website development blog covers
// Each post gets its own card: a palette per topic hub, a gradient angle, background pattern and panel shape picked
// from the slug, and a line illustration that matches the post's subject (cart, shield, gauge, code, cloud ...).
const PALETTES = {
  "/website-design-agency/": ["#0b1d3a", "#1554c0", "#ffb547"],
  "/website-design-development/": ["#1a0b3a", "#6b2bd9", "#41e0c4"],
  "/business-corporate-websites/": ["#0c2a2a", "#0f766e", "#fcd34d"],
  "/ecommerce-development/": ["#3a0b1f", "#c2185b", "#ffd166"],
  "/website-development-cost/": ["#13281a", "#2e7d32", "#ffe082"],
  "/wordpress-cms-development/": ["#0b2236", "#21759b", "#f2a33a"],
  "/custom-web-development/": ["#241405", "#b45309", "#7dd3fc"],
  "/frontend-development/": ["#071a2e", "#0284c7", "#f472b6"],
  "/backend-development/": ["#0f172a", "#334155", "#34d399"],
  "/full-stack-database-development/": ["#1e1035", "#7c3aed", "#fbbf24"],
  "/ai-website-development/": ["#04141f", "#0e7490", "#c4b5fd"],
  "/web-architecture-cloud-development/": ["#0a1630", "#1d4ed8", "#38bdf8"],
  "/website-seo-performance/": ["#062a1f", "#059669", "#fde047"],
  "/website-security/": ["#1f0a0a", "#b91c1c", "#fbbf24"],
  "/website-maintenance-redesign/": ["#1c1917", "#57534e", "#fb923c"],
  "/website-development-location/": ["#2a0f3d", "#a21caf", "#fde68a"],
  "/technology-development-services/": ["#031c26", "#0369a1", "#fb923c"],
};
const DEFAULT_PALETTE = ["#0a1424", "#0352a3", "#9cc6f5"];
// every blog cover shares one blue background; the accent colour (pill, icon, pattern) changes per category / hub
const BG = ["#061638", "#0a4fb8"];
const ACCENTS = ["#ffb547", "#41e0c4", "#fcd34d", "#f472b6", "#7dd3fc", "#34d399", "#c4b5fd", "#fb923c", "#fde047", "#a5f3fc", "#fda4af", "#bef264"];
const CAT_ACCENT = { "SEO": "#fde047", "Local SEO": "#34d399", "AEO": "#f472b6", "GEO": "#c4b5fd", "AIO": "#a5f3fc",
  "GMB": "#34d399", "Backlinks": "#bef264", "WhatsApp Automation": "#4ade80", "AI Tools": "#fda4af", "Articles": "#fda4af", "Website Development": "#ffb547",
  "SEO · AEO · GEO · AIO": "#7dd3fc", "SEO by City": "#7dd3fc" };

// line illustrations drawn in a 200x200 box (stroke = accent colour)
const ICONS = {
  link: `<path d="M86 114a34 34 0 0 0 48 0l30-30a34 34 0 0 0-48-48l-14 14"/><path d="M114 86a34 34 0 0 0-48 0l-30 30a34 34 0 0 0 48 48l14-14"/>`,
  people: `<circle cx="70" cy="70" r="26"/><circle cx="138" cy="78" r="20"/><path d="M22 170c0-30 22-52 48-52s48 22 48 52M118 170c0-24 10-42 30-42s32 18 32 42"/>`,
  browser: `<rect x="10" y="30" width="180" height="140" rx="14"/><path d="M10 64h180"/><circle cx="32" cy="47" r="5" class="f"/><circle cx="50" cy="47" r="5" class="f"/><circle cx="68" cy="47" r="5" class="f"/><path d="M36 96h80M36 120h128M36 144h100"/>`,
  code: `<path d="M64 52 22 100l42 48M136 52l42 48-42 48M114 40 86 160"/>`,
  cart: `<path d="M12 32h30l26 100h96l22-72H56"/><circle cx="84" cy="162" r="12"/><circle cx="150" cy="162" r="12"/>`,
  shield: `<path d="M100 14 170 44v56c0 45-35 75-70 88-35-13-70-43-70-88V44Z"/><path d="m68 100 24 24 42-46"/>`,
  gauge: `<path d="M28 150a76 76 0 1 1 144 0"/><path d="M100 150 146 92"/><circle cx="100" cy="150" r="11" class="f"/><path d="M46 112h12M100 58v12M142 112h12"/>`,
  rupee: `<circle cx="100" cy="100" r="82"/><path d="M66 58h70M66 84h70M66 58h22c26 0 34 28 0 34H70l52 54"/>`,
  database: `<ellipse cx="100" cy="42" rx="70" ry="22"/><path d="M30 42v116c0 12 31 22 70 22s70-10 70-22V42M30 100c0 12 31 22 70 22s70-10 70-22"/>`,
  cloud: `<path d="M56 150h96a40 40 0 0 0-6-80 56 56 0 0 0-104 16 33 33 0 0 0 14 64Z"/><path d="M80 178v-28M120 178v-28"/>`,
  ai: `<rect x="52" y="52" width="96" height="96" rx="16"/><rect x="80" y="80" width="40" height="40" rx="6"/><path d="M76 52V26M100 52V26M124 52V26M76 174v-26M100 174v-26M124 174v-26M52 76H26M52 100H26M52 124H26M174 76h-26M174 100h-26M174 124h-26"/>`,
  chat: `<path d="M18 36h164v104H92l-44 38v-38H18Z"/><circle cx="62" cy="88" r="7" class="f"/><circle cx="100" cy="88" r="7" class="f"/><circle cx="138" cy="88" r="7" class="f"/>`,
  pin: `<path d="M100 186S38 120 38 80a62 62 0 0 1 124 0c0 40-62 106-62 106Z"/><circle cx="100" cy="80" r="22"/>`,
  gear: `<circle cx="100" cy="100" r="50"/><circle cx="100" cy="100" r="20"/><path d="M100 22v28M100 150v28M22 100h28M150 100h28M45 45l20 20M135 135l20 20M155 45l-20 20M65 135l-20 20"/>`,
  layers: `<path d="M100 28 180 70l-80 42-80-42Z"/><path d="m20 106 80 42 80-42M20 142l80 42 80-42"/>`,
  phone: `<rect x="58" y="14" width="84" height="172" rx="16"/><path d="M88 160h24M58 40h84"/>`,
  search: `<circle cx="84" cy="84" r="56"/><path d="m126 126 52 52M60 84h48"/>`,
  compare: `<rect x="12" y="38" width="78" height="124" rx="12"/><rect x="110" y="38" width="78" height="124" rx="12"/><path d="M30 70h42M30 94h30M128 70h42M128 94h30M51 130v14M149 124v20"/>`,
};
const TOPICS = [
  [/-vs-|\bvs\b/i, "compare"],
  [/whatsapp/i, "chat"],
  [/\bats\b|ats-|hrms|\bhr-|recruit|hiring/i, "people"],
  [/backlink|profile-creation|link-building/i, "link"],
  [/gmb|google-business|geo-targeting|near-me/i, "pin"],
  [/workflow|automation/i, "gear"],
  [/answer-engine|\baeo\b/i, "chat"],
  [/ecommerce|shopify|woocommerce|commerce|store/i, "cart"],
  [/secur|ssl|malware|backup/i, "shield"],
  [/cost|price|pricing|budget/i, "rupee"],
  [/chatbot|voice|assistant/i, "chat"],
  [/\bai\b|ai-|rag-|agent|generative|personali/i, "ai"],
  [/speed|vitals|performance|rendering|static-site|server-side|edge-/i, "gauge"],
  [/database|sql|firebase|supabase/i, "database"],
  [/cloud|aws|vercel|docker|kubernetes|serverless|hosting|microservice|jamstack/i, "cloud"],
  [/patna|delhi|mumbai|bangalore|hyderabad|bihar|in-india/i, "pin"],
  [/maintenance|redesign|checklist|timeline|process/i, "gear"],
  [/cms|wordpress|webflow|headless/i, "layers"],
  [/mobile|responsive|progressive|pwa/i, "phone"],
  [/seo|search|architecture|lead-generation/i, "search"],
  [/react|angular|vue|next|node|nest|laravel|python|typescript|tailwind|bootstrap|backend|frontend|stack|api|express|django|svelte|saas|application/i, "code"],
];
const hash = (s) => [...s].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);

const PATTERNS = [
  (c) => `<pattern id="p" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.4" fill="${c}"/></pattern>`,
  (c) => `<pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v26" stroke="${c}" stroke-width="2"/></pattern>`,
  (c) => `<pattern id="p" width="60" height="52" patternUnits="userSpaceOnUse"><path d="M15 0h30l15 26-15 26H15L0 26Z" fill="none" stroke="${c}" stroke-width="1.6"/></pattern>`,
  (c) => `<pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0v48" fill="none" stroke="${c}" stroke-width="1.6"/></pattern>`,
  (c) => `<pattern id="p" width="80" height="24" patternUnits="userSpaceOnUse"><path d="M0 12q20-14 40 0t40 0" fill="none" stroke="${c}" stroke-width="2"/></pattern>`,
];

// Blog cover rule: every post and guide uses the SAME card - blue gradient, hexagon pattern, rounded icon panel, same
// glow positions. Only the category (pill text + accent colour), the topic icon and the title change.
export function makeArticleCover({ dir = "articles", slug, title, hub, cluster, id, label, accentKey, icon: iconName, alt }) {
  const [c1, c2] = BG;
  const acc = CAT_ACCENT[accentKey] || (hub && PALETTES[hub] ? PALETTES[hub][2] : ACCENTS[hash(accentKey || slug) % ACCENTS.length]);
  const h = 0;
  const angle = [0, 0, 1, 1];
  const pattern = PATTERNS[2](acc);
  const shape = 0;
  const icon = ICONS[iconName || (TOPICS.find(([re]) => re.test(slug)) || [0, /seo|rank|search/i.test(slug) ? "search" : "browser"])[1]];
  let size = 54, lines = wrap(title, 22);
  if (lines.length > 4) { size = 46; lines = wrap(title, 26).slice(0, 5); }
  const lh = Math.round(size * 1.18), y0 = 320 - ((lines.length - 1) * lh) / 2 + size / 3;
  const topic = String(label || cluster || "Website development").replace(/^C\d+\s+/, "");
  const panel = [
    `<rect x="772" y="135" width="360" height="360" rx="44" fill="#fff" fill-opacity=".08" stroke="${acc}" stroke-opacity=".45" stroke-width="2"/>`,
    `<circle cx="952" cy="315" r="190" fill="#fff" fill-opacity=".08" stroke="${acc}" stroke-opacity=".45" stroke-width="2"/>`,
    `<rect x="772" y="135" width="360" height="360" rx="44" fill="#fff" fill-opacity=".08" stroke="${acc}" stroke-opacity=".45" stroke-width="2" transform="rotate(-6 952 315)"/>`,
  ][shape];
  const blob = [`<circle cx="1080" cy="80" r="210" fill="${acc}" opacity=".14"/>`,
    `<circle cx="60" cy="600" r="170" fill="${c2}" opacity=".5"/>`].join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${E(title)}">
<defs><linearGradient id="g" x1="${angle[0]}" y1="${angle[1]}" x2="${angle[2]}" y2="${angle[3]}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>${pattern}
<style>.ic{fill:none;stroke:${acc};stroke-width:9;stroke-linecap:round;stroke-linejoin:round}.ic .f{fill:${acc};stroke:none}</style></defs>
<rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#p)" opacity=".14"/>${blob}
${panel}<g class="ic" transform="translate(827 190) scale(1.25)">${icon}</g>
<rect x="72" y="66" width="${Math.min(620, 40 + topic.length * 15)}" height="46" rx="23" fill="${acc}"/>
<text x="94" y="97" fill="${c1}" font-family="Segoe UI,Arial,sans-serif" font-size="21" font-weight="700" letter-spacing="1.2">${E(topic.toUpperCase())}</text>
${lines.map((l, i) => `<text x="72" y="${Math.round(y0 + i * lh)}" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="800">${E(l)}</text>`).join("\n")}
<rect x="72" y="532" width="64" height="6" rx="3" fill="${acc}"/>
<text x="72" y="578" fill="#fff" fill-opacity=".9" font-family="Segoe UI,Arial,sans-serif" font-size="26" font-weight="700">openink Hub</text>
<text x="236" y="578" fill="#fff" fill-opacity=".6" font-family="Segoe UI,Arial,sans-serif" font-size="22" font-weight="600">${dir === "pages" || dir === "categories" ? "" : "Blog"}</text></svg>\n`;
  const out = path.join(ROOT, "static", "images", dir);
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${slug}.svg`);
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== svg) fs.writeFileSync(file, svg);
  return { src: `${BASE}/images/${dir}/${slug}.svg`, alt: alt || title, width: 1200, height: 630 };
}

/** <figure> markup for placing the cover inside the content (so it counts as a content image). */
export const coverFigure = (img) => `<figure><img src="${img.src}" alt="${E(img.alt)}" width="${img.width}" height="${img.height}"></figure>`;
