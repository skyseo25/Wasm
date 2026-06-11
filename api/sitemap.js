/**
 * وسم — خريطة موقع ديناميكية (/sitemap.xml).
 * تقرأ المقالات من Firestore وتضيفها تلقائيًا مع الصفحات الثابتة.
 * تتحدّث وحدها مع كل مقال جديد — بدون تعديل يدوي.
 */

const PROJECT = "wasm-61734";
const API_KEY = "AIzaSyBZSbasVM-dVYbNE-qUZb9eREZrtaTBRqo";
const SITE = "https://alwasm.net";
const FS = "https://firestore.googleapis.com/v1/projects/" + PROJECT +
           "/databases/(default)/documents/wsm_articles?pageSize=300&key=" + API_KEY;

function slugify(t) {
  return String(t || "")
    .trim()
    .replace(/[\s\u00A0]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function xmlEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function loadArticles() {
  const r = await fetch(FS);
  if (!r.ok) throw new Error("firestore " + r.status);
  const data = await r.json();
  return (data.documents || []).map(function (d) {
    const f = d.fields || {};
    return {
      title: f.title && f.title.stringValue ? f.title.stringValue : "",
      on: f.on && typeof f.on.booleanValue === "boolean" ? f.on.booleanValue : true,
      order: f.order && f.order.integerValue ? parseInt(f.order.integerValue, 10) : 0,
      updated: d.updateTime || ""
    };
  }).filter(function (a) { return a.on !== false && a.title; })
    .sort(function (a, b) { return a.order - b.order; });
}

function urlTag(loc, lastmod, priority) {
  let s = "  <url>\n    <loc>" + xmlEsc(loc) + "</loc>\n";
  if (lastmod) s += "    <lastmod>" + xmlEsc(String(lastmod).slice(0, 10)) + "</lastmod>\n";
  if (priority) s += "    <priority>" + priority + "</priority>\n";
  s += "  </url>\n";
  return s;
}

module.exports = async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  let body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  body += urlTag(SITE + "/", today, "1.0");
  body += urlTag(SITE + "/about", today, "0.5");
  body += urlTag(SITE + "/contact", today, "0.5");
  body += urlTag(SITE + "/privacy", today, "0.3");
  body += urlTag(SITE + "/terms", today, "0.3");

  try {
    const list = await loadArticles();
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      let slug = slugify(list[i].title);
      if (!slug) continue;
      if (seen[slug]) { slug = slug + "-" + (seen[slug] + 1); seen[slugify(list[i].title)]++; }
      else { seen[slug] = 1; }
      body += urlTag(SITE + "/article/" + encodeURIComponent(slug), list[i].updated || today, "0.8");
    }
  } catch (e) { /* لو تعذّر قراءة المقالات، تبقى الصفحات الثابتة على الأقل */ }

  body += "</urlset>\n";

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(body);
};
