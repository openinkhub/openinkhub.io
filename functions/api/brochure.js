/**
 * POST /api/brochure  (Cloudflare Pages Function)
 *
 * Takes { name, email, phone, plan } from the AI SEO brochure form, emails the plan's brochure (PDF attached
 * plus a download link) to the visitor from info@openinkhub.io, and emails the lead to info@openinkhub.io.
 * Leads are not stored anywhere else.
 *
 * Settings (Cloudflare dashboard > Pages project > Settings > Variables and secrets):
 *   SMTP_PASS   secret, the info@openinkhub.io mailbox password (Hostinger)      required
 *   SMTP_USER   default info@openinkhub.io
 *   SMTP_HOST   default smtp.hostinger.com      SMTP_PORT  default 465 (implicit TLS)
 *   LEAD_TO     default info@openinkhub.io (where lead alerts go)
 */
import { connect } from "cloudflare:sockets";

const PLANS = {
  basic: { name: "Basic AI SEO plan", file: "/brochures/openink-hub-basic-ai-seo-plan.pdf", page: "/affordable-seo-packages/" },
  standard: { name: "Standard AI SEO plan", file: "/brochures/openink-hub-standard-ai-seo-plan.pdf", page: "/seo-pricing-packages/" },
  premium: { name: "Premium AI SEO plan", file: "/brochures/openink-hub-premium-ai-seo-plan.pdf", page: "/monthly-seo-packages/" },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (s, max) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function onRequestPost({ request, env }) {
  let d;
  try { d = request.headers.get("content-type")?.includes("json") ? await request.json() : Object.fromEntries(await request.formData()); }
  catch { return json({ ok: false, error: "Could not read the form." }, 400); }
  if (d.website) return json({ ok: true }); // honeypot: bots fill the hidden field
  const name = clean(d.name, 80), email = clean(d.email, 120).toLowerCase(), phone = clean(d.phone, 20);
  const keys = String(d.plan || "").split(",").map((k) => k.trim()).filter((k) => PLANS[k]);
  if (!keys.length) keys.push(...Object.keys(PLANS)); // "all brochures"
  if (name.length < 2) return json({ ok: false, error: "Please enter your name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return json({ ok: false, error: "Please enter a valid email address." }, 400);
  if (phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "Please enter a valid phone number." }, 400);
  if (!env.SMTP_PASS) return json({ ok: false, error: "Email is not set up yet. Please write to info@openinkhub.io." }, 503);

  const origin = new URL(request.url).origin;
  const files = [];
  for (const k of keys) {
    const p = PLANS[k];
    try {
      const r = await (env.ASSETS ? env.ASSETS.fetch(new URL(p.file, origin)) : fetch(new URL(p.file, origin)));
      if (r.ok) files.push({ filename: p.file.split("/").pop(), data: new Uint8Array(await r.arrayBuffer()) });
    } catch { /* the email still carries the download link */ }
  }
  const list = keys.map((k) => PLANS[k]);
  const from = env.SMTP_USER || "info@openinkhub.io";
  const leadTo = env.LEAD_TO || "info@openinkhub.io";
  const linksHtml = list.map((p) => `<li><a href="${origin}${p.file}">${esc(p.name)} brochure (PDF)</a> · <a href="${origin}${p.page}">plan page</a></li>`).join("");
  const linksText = list.map((p) => `- ${p.name}: ${origin}${p.file}`).join("\n");
  try {
    await sendMail(env, from, [
      {
        to: email, replyTo: from,
        subject: list.length > 1 ? "Your Openink Hub AI SEO brochures" : `Your Openink Hub ${list[0].name} brochure`,
        text: `Hi ${name},\n\nThank you for your interest in Openink Hub AI SEO. Your brochure${list.length > 1 ? "s are" : " is"} attached. You can also download ${list.length > 1 ? "them" : "it"} here:\n${linksText}\n\nReply to this email or WhatsApp us to book a free 30-minute strategy call.\n\nOpenink Hub\n${origin}`,
        html: `<p>Hi ${esc(name)},</p><p>Thank you for your interest in Openink Hub AI SEO. Your brochure${list.length > 1 ? "s are" : " is"} attached. You can also download ${list.length > 1 ? "them" : "it"} here:</p><ul>${linksHtml}</ul><p>Reply to this email to book a free 30-minute strategy call.</p><p>Openink Hub<br><a href="${origin}">${origin.replace(/^https?:\/\//, "")}</a></p>`,
        files,
      },
      {
        to: leadTo, replyTo: email,
        subject: `Brochure lead: ${name} (${list.map((p) => p.name.split(" ")[0]).join(", ")})`,
        text: `New AI SEO brochure request\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nBrochure: ${list.map((p) => p.name).join(", ")}\nPage: ${clean(d.page, 200) || request.headers.get("referer") || ""}\nTime: ${new Date().toISOString()}\n`,
        html: `<p><strong>New AI SEO brochure request</strong></p><table><tr><td>Name</td><td>${esc(name)}</td></tr><tr><td>Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr><tr><td>Phone</td><td><a href="tel:${esc(phone)}">${esc(phone)}</a></td></tr><tr><td>Brochure</td><td>${esc(list.map((p) => p.name).join(", "))}</td></tr><tr><td>Page</td><td>${esc(clean(d.page, 200) || request.headers.get("referer") || "")}</td></tr></table>`,
        files: [],
      },
    ]);
  } catch (e) {
    console.log("brochure mail failed:", e && e.message);
    return json({ ok: false, error: "We could not send the email right now. Please try again, or write to info@openinkhub.io.", downloads: list.map((p) => p.file) }, 502);
  }
  return json({ ok: true, downloads: list.map((p) => p.file) });
}

export const onRequestGet = () => json({ ok: false, error: "POST only" }, 405);

/* ---------- minimal SMTP client (implicit TLS, AUTH LOGIN) ---------- */
const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const b64s = (str) => b64(new TextEncoder().encode(str));
const wrap = (s) => s.replace(/.{1,76}/g, "$&\r\n");
const hdr = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64s(s)}?=`;

function mime(from, m) {
  const id = crypto.randomUUID();
  const alt = `alt-${id}`, mix = `mix-${id}`;
  const body = `--${alt}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64s(m.text))}--${alt}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64s(m.html))}--${alt}--\r\n`;
  const head = [`From: Openink Hub <${from}>`, `To: <${m.to}>`, `Reply-To: <${m.replyTo}>`, `Subject: ${hdr(m.subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}@openinkhub.io>`, "MIME-Version: 1.0"];
  if (!m.files.length) return `${head.join("\r\n")}\r\nContent-Type: multipart/alternative; boundary="${alt}"\r\n\r\n${body}`;
  const parts = m.files.map((f) => `--${mix}\r\nContent-Type: application/pdf; name="${f.filename}"\r\nContent-Disposition: attachment; filename="${f.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(f.data))}`).join("");
  return `${head.join("\r\n")}\r\nContent-Type: multipart/mixed; boundary="${mix}"\r\n\r\n--${mix}\r\nContent-Type: multipart/alternative; boundary="${alt}"\r\n\r\n${body}${parts}--${mix}--\r\n`;
}

async function sendMail(env, from, messages) {
  const sock = connect({ hostname: env.SMTP_HOST || "smtp.hostinger.com", port: Number(env.SMTP_PORT || 465) }, { secureTransport: "on" });
  const w = sock.writable.getWriter(), r = sock.readable.getReader();
  const enc = new TextEncoder(), dec = new TextDecoder();
  let buf = "";
  const reply = async () => {
    for (;;) {
      const lines = buf.split("\r\n");
      if (buf.endsWith("\r\n") && /^\d{3} /.test(lines[lines.length - 2] || "")) { const out = buf; buf = ""; return out; }
      const { value, done } = await r.read();
      if (done) throw new Error("SMTP connection closed");
      buf += dec.decode(value, { stream: true });
    }
  };
  const cmd = async (line, ok) => {
    if (line !== null) await w.write(enc.encode(line + "\r\n"));
    const res = await reply();
    if (!res.startsWith(ok)) throw new Error(`SMTP ${line === null ? "greeting" : line.split(" ")[0]} -> ${res.trim().slice(0, 120)}`);
    return res;
  };
  try {
    await cmd(null, "220");
    await cmd("EHLO openinkhub.io", "250");
    await cmd("AUTH LOGIN", "334");
    await cmd(b64s(env.SMTP_USER || "info@openinkhub.io"), "334");
    await cmd(b64s(env.SMTP_PASS), "235");
    for (const m of messages) {
      await cmd(`MAIL FROM:<${from}>`, "250");
      await cmd(`RCPT TO:<${m.to}>`, "25");
      await cmd("DATA", "354");
      const data = mime(from, m).replace(/\r\n\./g, "\r\n..");
      await cmd(`${data}\r\n.`, "250");
    }
    await w.write(enc.encode("QUIT\r\n")).catch(() => {});
  } finally {
    try { await sock.close(); } catch {}
  }
}
