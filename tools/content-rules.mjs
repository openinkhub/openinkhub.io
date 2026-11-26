/**
 * Content rules applied to every page at build time (called from fixRecord in seo-fix.mjs).
 *
 *  simpleWords     "optimization", "generative", "artificial intelligence" -> plain words or SEO/AEO/GEO/AIO/AI,
 *                  except inside the page's own keyphrases (rules.json -> simpleWords)
 *  longParagraphs  paragraphs over the word limit are split at the sentence nearest the middle
 *  titleYear       adds the current year to <title> (and og/twitter titles) when it has none and still fits
 */

const ACR = new Set(["SEO", "AEO", "GEO", "AIO", "AI", "CRO", "LLM"]);
// order matters: longer phrases first
const SIMPLE = [
  [/\bsearch engine optimi[sz]ation\s*\(SEO\)/gi, "SEO"],
  [/\banswer engine optimi[sz]ation\s*\(AEO\)/gi, "AEO"],
  [/\bgenerative engine optimi[sz]ation\s*\(GEO\)/gi, "GEO"],
  [/\b(?:artificial intelligence|AI) optimi[sz]ation\s*\(AIO\)/gi, "AIO"],
  [/\bsearch engine optimi[sz]ation\b/gi, "SEO"],
  [/\banswer engine optimi[sz]ation\b/gi, "AEO"],
  [/\bgenerative engine optimi[sz]ation\b/gi, "GEO"],
  [/\b(?:artificial intelligence|AI) optimi[sz]ation\b/gi, "AIO"],
  [/\bknowledge graph optimi[sz]ation\b/gi, "knowledge graph work"],
  [/\bconversion (?:rate )?optimi[sz]ation\b/gi, "conversion improvement"],
  [/\b(?:LLM|large language model) optimi[sz]ation\b/gi, "LLM visibility work"],
  [/\bartificial intelligence\b/gi, "AI"],
  [/\bgenerative AI\b/gi, "AI"],
  [/\bgeneratively\b/gi, "automatically"],
  [/\bgenerative\b/gi, "AI"],
  [/\bSEO-optimi[sz]ed\b/gi, "SEO-ready"],
  [/\boptimi[sz]ed for\b/gi, "built for"],
  [/\boptimi[sz]ations\b/gi, "improvements"],
  [/\boptimi[sz]ation\b/gi, "improvement"],
  [/\boptimi[sz]ing\b/gi, "improving"],
  [/\boptimi[sz]es\b/gi, "improves"],
  [/\boptimi[sz]ed\b/gi, "tuned"],
  [/\boptimi[sz]er\b/gi, "tool"],
  [/\boptimi[sz]e\b/gi, "improve"],
];
// plain-English swaps for common long words (site-wide, keyphrases excluded) and inclusive wording
const PLAIN = [
  [/\butili[sz](e|es|ed|ing)\b/gi, (m, e) => ({ e: "use", es: "uses", ed: "used", ing: "using" }[e.toLowerCase()])],
  [/\butili[sz]ation\b/gi, "use"], [/\badditionally\b/gi, "also"], [/\bapproximately\b/gi, "about"],
  [/\bdemonstrat(e|es|ed|ing)\b/gi, (m, e) => ({ e: "show", es: "shows", ed: "showed", ing: "showing" }[e.toLowerCase()])],
  [/\bfacilitat(e|es|ed|ing)\b/gi, (m, e) => ({ e: "help", es: "helps", ed: "helped", ing: "helping" }[e.toLowerCase()])],
  [/\bfunctionalit(y|ies)\b/gi, "features"], [/\bmethodolog(y|ies)\b/gi, "method"], [/\bcomprehensive\b/gi, "full"],
  [/\bsignificantly\b/gi, "greatly"], [/\bconsequently\b/gi, "so"], [/\bnumerous\b/gi, "many"], [/\bsophisticated\b/gi, "advanced"],
  [/\boptimal\b/gi, "best"], [/\bmaximi[sz](e|es|ing)\b/gi, (m, e) => ({ e: "boost", es: "boosts", ing: "boosting" }[e.toLowerCase()])],
  [/\bminimi[sz](e|es|ing)\b/gi, (m, e) => ({ e: "cut", es: "cuts", ing: "cutting" }[e.toLowerCase()])],
  [/\beliminat(e|es|ed|ing)\b/gi, (m, e) => ({ e: "remove", es: "removes", ed: "removed", ing: "removing" }[e.toLowerCase()])],
  [/\bseamlessly\b/gi, "smoothly"], [/\bseamless\b/gi, "smooth"], [/\bleverag(e|es|ing)\b/gi, (m, e) => ({ e: "use", es: "uses", ing: "using" }[e.toLowerCase()])],
  [/\benhanc(e|es|ing)\b/gi, (m, e) => ({ e: "improve", es: "improves", ing: "improving" }[e.toLowerCase()])], [/\benhanced\b/gi, "better"],
  [/\bopportunities\b/gi, "chances"], [/\bopportunity\b/gi, "chance"], [/\bimmediately\b/gi, "at once"], [/\bfrequently\b/gi, "often"],
  [/\bnecessary\b/gi, "needed"], [/\bprimarily\b/gi, "mainly"], [/\bcurrently\b/gi, "now"], [/\bpreviously\b/gi, "before"],
  [/\beffectively\b/gi, "well"], [/\bpersonali[sz]ed\b/gi, "tailored"], [/\bpersonali[sz]ation\b/gi, "tailoring"],
  [/\brevolutioni[sz](e|es|ing)\b/gi, (m, e) => ({ e: "change", es: "changes", ing: "changing" }[e.toLowerCase()])], [/\binnovative\b/gi, "new"],
  [/\bindividuals\b/gi, "people"], [/\bcommunicate\b/gi, "talk"], [/\bnumerous\b/gi, "many"], [/\bvarious\b/gi, "many"],
  [/\bAI assistants\b/g, "AI tools"], [/\bdigital\b/gi, "online"], [/\binformation\b/gi, "details"], [/\bmanufacturers\b/gi, "makers"],
  [/\bmanufacturer\b/gi, "maker"], [/\bimportant\b/gi, "key"], [/\baccurate\b/gi, "correct"], [/\baccurately\b/gi, "correctly"],
  [/\bdocumentation\b/gi, "docs"], [/\bcertifications\b/gi, "certificates"], [/\bapproximately\b/gi, "about"],
  [/\bmanpower\b/gi, "workforce"], [/\bchairman\b/gi, "chair"], [/\bmankind\b/gi, "humanity"], [/\bman-hours\b/gi, "work hours"],
];
const TARGET = /optimi[sz]|generativ|artificial intelligence|utili[sz]|additionally|approximately|demonstrat|facilitat|functionalit|methodolog|comprehensive|significantly|consequently|numerous|sophisticated|optimal|maximi[sz]|minimi[sz]|eliminat|seamless|leverag|enhanc|opportunit|immediately|frequently|necessary|primarily|currently|previously|effectively|personali[sz]|revolutioni|innovative|individuals|communicate|various|manpower|chairman|mankind|man-hours|AI assistants|digital|information|manufacturer|important|accurate|documentation|certifications/i;
const caseLike = (src, rep) => (ACR.has(rep.split(/[\s-]/)[0]) || !/^[A-Z]/.test(src) ? rep : rep.charAt(0).toUpperCase() + rep.slice(1));

/** Simplify one plain-text string, keeping protected phrases (keyphrases) unchanged. */
export function simplifyText(text, protect = []) {
  if (!TARGET.test(text)) return text;
  const keep = [];
  let t = text;
  for (const ph of protect) {
    if (!ph || !TARGET.test(ph)) continue;
    const re = new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi");
    t = t.replace(re, (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0001`; });
  }
  for (const [re, rep] of SIMPLE) t = t.replace(re, (m) => caseLike(m, rep));
  for (const [re, rep] of PLAIN) t = t.replace(re, (m, ...g) => caseLike(m, typeof rep === "function" ? rep(m, ...g) : rep));
  t = t.replace(/\b([A-Z]{2,4})\s*\(\1\)/g, "$1")          // "AEO (AEO)"
    .replace(/\bAI(?:\s+AI)+\b/g, "AI")                     // "AI AI"
    .replace(/\ban (AI|AEO|AIO)\b/g, "an $1").replace(/\ba (AEO|AIO)\b/g, "an $1");
  return t.replace(/\u0001(\d+)\u0001/g, (_, i) => keep[+i]);
}

/** Apply simplifyText to the text nodes of an HTML string (tags, attributes and URLs untouched). */
export function simplifyHtml(html, protect = []) {
  if (!html || !TARGET.test(html)) return html;
  return html.replace(/>([^<]+)</g, (m, txt) => `>${simplifyText(txt, protect)}<`)
    .replace(/^([^<]+)/, (m, txt) => simplifyText(txt, protect));
}

export function simpleWords(rec, fixes, cfg = {}) {
  if (cfg.enabled === false) return;
  const protect = [rec.keyphrase, ...(rec.keyphrase_secondary || []), ...(cfg.keep || [])].filter(Boolean);
  const before = rec.content_html;
  rec.content_html = simplifyHtml(rec.content_html, protect);
  if (rec.h1) rec.h1 = simplifyHtml(rec.h1, protect);
  for (const f of rec.faqs || []) { f.q = simplifyText(f.q, protect); f.a = simplifyHtml(f.a, protect); }
  // keep FAQ schema in step with the visible text
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const qa = n["@type"] === "Question" || n["@type"] === "Answer";
    for (const [k, v] of Object.entries(n)) {
      if (typeof v === "string" && qa && (k === "name" || k === "text")) n[k] = simplifyText(v, protect);
      else if (typeof v === "object") walk(v);
    }
  };
  walk(rec.head?.jsonld);
  if (rec.content_html !== before) fixes.push("simple-words");
}

/** Split long sentences (> maxWords) at a natural clause break near the middle: "; ", " — ", ", but ", ", so ",
 *  or ", and <new subject>". Both halves must keep at least 7 words. Applied to <p> and <li> text. */
const SUBJ = "we|you|it|they|this|that|these|those|our|your|their|the|a|an|many|most|each|every|search|google|customers|users|businesses|companies|ai|people|teams|buyers|visitors|clients";
export function shortSentences(rec, fixes, maxWords = 22) {
  let n = 0;
  const wc = (s) => wordsIn(s);
  const cap = (s) => s.replace(/^(\s*(?:<[^>]+>\s*)*)([a-z])/, (m, pre, ch) => pre + ch.toUpperCase());
  const splitOne = (sent) => {
    if (wc(sent) <= maxWords) return [sent];
    const re = new RegExp(`(;\\s+|\\s+[—–]\\s+|,\\s+but\\s+|,\\s+so\\s+|,\\s+while\\s+|,\\s+which\\s+(?=(?:is|are|helps|help|means|makes|gives|lets|keeps|saves|turns|builds|brings|improves|reduces)\\b)|,\\s+and\\s+(?=(?:${SUBJ})\\b))`, "gi");
    const cands = [];
    for (const m of sent.matchAll(re)) {
      const before = sent.slice(0, m.index);
      if ((before.match(/</g) || []).length !== (before.match(/>/g) || []).length) continue; // inside a tag
      if ((before.match(/<(a|strong|b|em|span)\b/g) || []).length !== (before.match(/<\/(a|strong|b|em|span)>/g) || []).length) continue;
      const after = sent.slice(m.index + m[0].length);
      if (wc(before) >= 7 && wc(after) >= 7) cands.push({ i: m.index, len: m[0].length, sep: m[0].trim().toLowerCase(), d: Math.abs(wc(before) - wc(sent) / 2) });
    }
    if (!cands.length) return [sent];
    const c = cands.sort((a, b) => a.d - b.d)[0];
    const head = sent.slice(0, c.i).replace(/[,;]$/, "") + ".";
    let tail = sent.slice(c.i + c.len);
    if (c.sep.startsWith(", but")) tail = "But " + tail; else if (c.sep.startsWith(", so")) tail = "So " + tail;
    else if (c.sep.startsWith(", while")) tail = "Meanwhile, " + tail; else if (c.sep.startsWith(", which")) tail = "This " + tail; else tail = cap(tail);
    n++;
    return [...splitOne(head), ...splitOne(tail)];
  };
  rec.content_html = rec.content_html.replace(/<(p|li)>([\s\S]*?)<\/\1>/g, (m, tag, inner) => {
    if (/<(p|div|ul|ol|table|h\d)\b/.test(inner) || wc(inner) <= maxWords) return m;
    const parts = inner.split(/(?<=[.!?])\s+(?=[A-Z<“"])/);
    return `<${tag}>${parts.map((s) => splitOne(s).join(" ")).join(" ")}</${tag}>`;
  });
  if (n) fixes.push(`sentence-split:${n}`);
}

const wordsIn = (s) => (String(s).replace(/<[^>]+>/g, " ").match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;

/** Split <p> blocks longer than maxWords at the sentence boundary closest to the middle (repeats until all fit). */
export function longParagraphs(rec, fixes, maxWords = 150) {
  let n = 0;
  const split = (inner) => {
    if (wordsIn(inner) <= maxWords) return [inner];
    // sentence boundaries outside tags: ". Next"
    const cuts = [];
    let depth = 0;
    for (let i = 0; i < inner.length - 2; i++) {
      const ch = inner[i];
      if (ch === "<") depth++; else if (ch === ">") depth = Math.max(0, depth - 1);
      else if (!depth && /[.!?]/.test(ch) && inner[i + 1] === " " && /[A-Z0-9“"]/.test(inner[i + 2])) cuts.push(i + 1);
    }
    // only cut where no inline tag is open (count opening vs closing tags before the cut)
    const ok = cuts.filter((c) => { const s = inner.slice(0, c); return (s.match(/<(a|strong|b|em|i|span)\b/g) || []).length === (s.match(/<\/(a|strong|b|em|i|span)>/g) || []).length; });
    if (!ok.length) return [inner];
    const total = wordsIn(inner);
    const best = ok.reduce((a, c) => (Math.abs(wordsIn(inner.slice(0, c)) - total / 2) < Math.abs(wordsIn(inner.slice(0, a)) - total / 2) ? c : a));
    n++;
    return [...split(inner.slice(0, best).trim()), ...split(inner.slice(best).trim())];
  };
  rec.content_html = rec.content_html.replace(/<p>([\s\S]*?)<\/p>/g, (m, inner) => {
    if (/<(p|div|ul|ol|table|h\d)\b/.test(inner)) return m;
    // a "paragraph" that is only a run of links (e.g. 100 city links) is really a list
    const links = inner.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || [];
    if (links.length >= 8 && !inner.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, "").replace(/[\s,·|•]+/g, "")) {
      n++; return `<ul class="chips">${links.map((a) => `<li>${a}</li>`).join("")}</ul>`;
    }
    return split(inner).map((x) => `<p>${x}</p>`).join("\n");
  });
  if (n) fixes.push(`paragraph-split:${n}`);
}

/** WordPress pseudo-headings -> real headings: a paragraph that is only bold text (<= 14 words, not a sentence)
 *  becomes <h3>; <h5>/<h6> become <h4>, so readers, screen readers and search engines see the structure. */
export function realHeadings(rec, fixes) {
  let n = 0;
  rec.content_html = rec.content_html
    .replace(/<p>\s*<(strong|b)>([^<]{3,110})<\/\1>\s*:?\s*<\/p>/g, (m, t, txt) => {
      const w = txt.trim().split(/\s+/).length;
      if (w > 14 || /[.!]$/.test(txt.trim())) return m;
      n++; return `<h3>${txt.trim().replace(/:$/, "")}</h3>`;
    })
    .replace(/<h([56])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (m, l, a, txt) => { n++; return `<h4${a || ""}>${txt}</h4>`; })
    // plain short lines that lost their heading tag in the export: "Benefits of AI SEO Automation", "1. Faster Keyword Research",
    // "What is AI SEO Automation?" - only when a real paragraph follows
    .replace(/<p>([^<]{6,90})<\/p>(?=\s*<p>[^<]{0,40}(?:<[^>]+>[^<]*)*?(?:\S+\s+){14})/g, (m, txt) => {
      const t = txt.trim(), w = t.split(/\s+/);
      if (w.length < 2 || w.length > 10 || /[.!,;:]$/.test(t) || /https?:|@/.test(t)) return m;
      const caps = w.filter((x) => /^[A-Z0-9]/.test(x)).length / w.length;
      if (!(t.endsWith("?") || /^\d+\.\s/.test(t) || caps >= 0.6)) return m;
      n++; return `<h3>${t}</h3>`;
    });
  // pages that use H4 for their main sections (no H3 at all): promote H4 -> H3
  const cut = rec.content_html.search(/<h2[^>]*>\s*(In summary|In short|Frequently asked questions)/i);
  const body = cut >= 0 ? rec.content_html.slice(0, cut) : rec.content_html, tail = cut >= 0 ? rec.content_html.slice(cut) : "";
  if (/<h4\b/.test(body) && !/content-source:articles/.test(rec.content_source || "")) {
    rec.content_html = body.replace(/<h4(\s[^>]*)?>([\s\S]*?)<\/h4>/g, (m, a, t) => { n++; return `<h3${a || ""}>${t}</h3>`; }) + tail;
  }
  if (n) fixes.push(`headings:${n}`);
}

/** Add the year to the title: "Topic | openink Hub" -> "Topic (2026) | openink Hub", only if it fits maxLen. */
export function titleYear(rec, fixes, { year, maxLen = 60, skipPaths = [], skipTypes = [], overrides = {} }) {
  const title = rec.head?.title || "";
  if (!title || /\b20\d\d\b/.test(title) || skipPaths.includes(rec.path) || skipTypes.includes(rec.type)) return;
  if (overrides[rec.path]) { // hand-written title for titles that cannot be shortened cleanly
    const next = overrides[rec.path];
    for (const x of rec.head.meta || []) if (["og:title", "twitter:title"].includes(x.key) && x.content === title) x.content = next;
    rec.head.title = next; if (rec.title === title) rec.title = next; fixes.push("title-year"); return;
  }
  const m = /^(.*?)(\s+[|–-]\s+openink Hub)$/i.exec(title);
  const core = m ? m[1] : title, suffix = m ? m[2] : "";
  const tries = [`${core} (${year})${suffix}`, `${core} (${year})`];
  // "Topic: subtitle" / "Topic | subtitle" -> "Topic (2026): subtitle", trimming the subtitle's last words if needed
  const sm = /^(.*?)\s*([:|])\s+(.*)$/.exec(core);
  if (sm) {
    const [, head, sep, sub] = sm;
    const join = (s) => `${head} (${year})${sep === ":" ? ":" : " |"} ${s}`;
    tries.push(join(sub) + suffix, join(sub));
    // drop whole list items from the end: "A, B & C" -> "A & B" -> "A"
    const segs = sub.split(/\s*,\s*|\s+&\s+|\s+and\s+/).filter(Boolean);
    for (let k = segs.length - 1; k >= 1; k--) {
      const s = k === 1 ? segs[0] : `${segs.slice(0, k - 1).join(", ")} & ${segs[k - 1]}`;
      if (s.split(/\s+/).length < 2 || /\b(Local|Lead|Voice)$/i.test(s)) continue; // would read as a cut-off phrase
      tries.push(join(s));
    }
  }
  const next = tries.find((t) => t.length <= maxLen && !/[,&:|]$/.test(t));
  if (!next) return;
  for (const x of rec.head.meta || []) if (["og:title", "twitter:title"].includes(x.key) && x.content === title) x.content = next;
  rec.head.title = next;
  if (rec.title === title) rec.title = next;
  fixes.push("title-year");
}

/** Blog posts and guides: the title ends with "in <year>" ("Topic: subtitle in 2027"), any other year removed, within maxLen. */
export function blogTitleYear(rec, fixes, { year, maxLen = 60, types = ["post", "guide"], overrides = {} }) {
  const title = rec.head?.title || "";
  if (!title || !types.includes(rec.type)) return;
  const Y = String(year);
  let core = title.replace(/\s+[|–-]\s+openink Hub$/i, "").trim();
  const endsRight = core.endsWith(` in ${Y}`) && !/\b20\d\d\b/.test(core.slice(0, -8));
  if (overrides[rec.path]) core = overrides[rec.path]; // hand-written: the automatic title would repeat "in"
  else if (!endsRight) {
    core = core
      .replace(/\s*\(\s*20\d\d\s+([A-Za-z][^)]*)\)/g, " $1") // "(2026 Guide)" -> "Guide"
      .replace(/\s*\(\s*20\d\d\s*\)/g, "")                    // "(2026)" / "(2027)"
      .replace(/\s+(?:for|in|of)\s+20\d\d\b/gi, "")           // "for 2026"
      .replace(/(^|\s)20\d\d(?=\s|:|$)/g, "$1")               // bare "2026"
      .replace(/\s+([:,])/g, "$1").replace(/\s{2,}/g, " ").replace(/[\s:|,&–-]+$/, "").trim();
    const STOP = /\b(and|or|the|a|an|of|for|in|to|with|by|on|at|from|vs)$|&$/i;
    const fit = (c) => `${c} in ${Y}`;
    let next = fit(core);
    if (next.length > maxLen) {
      // shorten the subtitle: drop list items, then words, from the end
      const tries = [];
      const m = /^(.*?[:|])\s+(.*)$/.exec(core);
      if (m) {
        const segs = m[2].split(/\s*,\s*|\s+&\s+|\s+and\s+/).filter(Boolean);
        for (let k = segs.length - 1; k >= 1; k--) tries.push(`${m[1]} ${k === 1 ? segs[0] : `${segs.slice(0, k - 1).join(", ")} & ${segs[k - 1]}`}`);
        tries.push(m[1].slice(0, -1));
      }
      const words = core.split(/\s+/);
      for (let k = words.length - 1; k >= 3; k--) tries.push(words.slice(0, k).join(" "));
      next = tries.map((t) => t.replace(/[\s:|,&–-]+$/, "")).filter((t) => !STOP.test(t) && !/\b(Local|Lead|Voice|Start|Auto)$/i.test(t)).map(fit).find((t) => t.length <= maxLen) || next;
    }
    core = next;
  }
  if (core === title) return;
  for (const x of rec.head.meta || []) if (["og:title", "twitter:title"].includes(x.key)) x.content = core;
  rec.head.title = core;
  rec.title = core;
  fixes.push("title-year");
}
