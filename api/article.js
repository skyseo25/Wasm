/**
 * وسم — صفحة مقال مستقلة (SSR) لمحركات البحث.
 * المسار العام: /article/{slug}  (يُوجَّه إليها عبر vercel.json)
 * تقرأ المقالات من Firestore عبر REST (القراءة عامة) — بدون مفاتيح سرّية.
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

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function loadArticles() {
  const r = await fetch(FS);
  if (!r.ok) throw new Error("firestore " + r.status);
  const data = await r.json();
  const docs = (data.documents || []).map(function (d) {
    const f = d.fields || {};
    return {
      id: (d.name || "").split("/").pop(),
      title: f.title && f.title.stringValue ? f.title.stringValue : "",
      body: f.body && f.body.stringValue ? f.body.stringValue : "",
      on: f.on && typeof f.on.booleanValue === "boolean" ? f.on.booleanValue : true,
      order: f.order && f.order.integerValue ? parseInt(f.order.integerValue, 10) : 0,
      updated: d.updateTime || ""
    };
  }).filter(function (a) { return a.on !== false && a.title; });
  docs.sort(function (a, b) { return a.order - b.order; });
  return docs;
}

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%2320352A'/%3E%3Cpath d='M50 80V46' stroke='%23C2933C' stroke-width='7' stroke-linecap='round'/%3E%3Cpath d='M50 54c-9-4-19-2-25 5 8 4 18 3 25-5Z' fill='%234E7A3A'/%3E%3Cpath d='M50 48c7-5 17-4 24 3-8 5-17 4-24-3Z' fill='%234E7A3A'/%3E%3C/svg%3E";

function page(article, slug) {
  const url = SITE + "/article/" + encodeURIComponent(slug);
  const desc = stripTags(article.body).slice(0, 155);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": desc,
    "inLanguage": "ar",
    "mainEntityOfPage": url,
    "publisher": { "@type": "Organization", "name": "وسم", "url": SITE }
  };
  return '<!DOCTYPE html>\n' +
'<html lang="ar" dir="rtl">\n' +
'<head>\n' +
"<!-- Google Tag Manager -->\n" +
"<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-5DXT7NTK');</script>\n" +
"<!-- End Google Tag Manager -->\n" +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n' +
'<meta name="theme-color" content="#20352A">\n' +
'<title>' + esc(article.title) + ' — وسم</title>\n' +
'<meta name="description" content="' + esc(desc) + '">\n' +
'<meta name="robots" content="index, follow">\n' +
'<link rel="canonical" href="' + esc(url) + '">\n' +
'<meta property="og:type" content="article">\n' +
'<meta property="og:site_name" content="وسم">\n' +
'<meta property="og:locale" content="ar_KW">\n' +
'<meta property="og:title" content="' + esc(article.title) + '">\n' +
'<meta property="og:description" content="' + esc(desc) + '">\n' +
'<meta property="og:url" content="' + esc(url) + '">\n' +
'<meta property="og:image" content="' + SITE + '/og-image.png">\n' +
'<link rel="icon" type="image/svg+xml" href="' + FAVICON + '">\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n' +
'<script type="application/ld+json">' + JSON.stringify(ld) + '</script>\n' +
'<style>\n' +
':root{--paper:#F4F0E5;--paper-2:#ECE6D5;--line:#E0D8C3;--soil:#20352A;--soil-2:#2E5248;--leaf:#4E7A3A;--gold:#C2933C;--ink:#243024;--muted:#6E7468}\n' +
'*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}\n' +
'html{-webkit-text-size-adjust:100%}\n' +
'body{font-family:\'Cairo\',system-ui,sans-serif;background:var(--paper);color:var(--ink);line-height:1.95;font-size:17px}\n' +
'.wrap{max-width:720px;margin:0 auto;padding:0 20px}\n' +
'header.brand{text-align:center;padding:40px 20px 22px}\n' +
'.mark{font-weight:700;color:var(--soil);font-size:clamp(2.4rem,11vw,3rem);line-height:1;text-decoration:none;display:inline-block}\n' +
'.rainline{width:120px;height:3px;margin:11px auto 0;background:linear-gradient(90deg,transparent,var(--gold),transparent);border-radius:3px}\n' +
'.eyebrow{font-size:.9rem;color:var(--muted);font-weight:600;margin-top:13px}\n' +
'main{padding:6px 0 10px}\n' +
'article h1{font-size:clamp(1.7rem,7vw,2.3rem);color:var(--soil);font-weight:800;margin:0 0 14px;line-height:1.35}\n' +
'.a-rule{width:64px;height:4px;border-radius:4px;background:var(--gold);margin:0 0 26px}\n' +
'article h2{font-size:1.25rem;color:var(--soil-2);font-weight:700;margin:30px 0 8px}\n' +
'article p{margin:0 0 15px}\n' +
'article ul,article ol{margin:0 0 15px;padding-inline-start:22px}\n' +
'article li{margin-bottom:9px}\n' +
'article b,article strong{color:var(--soil)}\n' +
'article a{color:var(--leaf);text-underline-offset:3px}\n' +
'.back{display:inline-block;margin:30px 0 0;font-weight:700;color:var(--leaf);text-decoration:none}\n' +
'footer{border-top:1px solid var(--line);margin-top:40px;padding:26px 20px 44px;text-align:center}\n' +
'.fnav{display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:center;font-size:.92rem;font-weight:600;margin-bottom:14px}\n' +
'.fnav a{color:var(--soil-2);text-decoration:none}\n' +
'.fnote{color:var(--muted);font-size:.85rem}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<!-- Google Tag Manager (noscript) -->\n' +
'<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5DXT7NTK" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n' +
'<!-- End Google Tag Manager -->\n' +
'<div class="wrap">\n' +
'<header class="brand"><a class="mark" href="/">وسم</a><div class="rainline"></div><div class="eyebrow">تقويم المواسم والزراعة في الكويت والخليج</div></header>\n' +
'<main><article><h1>' + esc(article.title) + '</h1><div class="a-rule"></div>' + article.body + '</article>\n' +
'<a class="back" href="/">← الرجوع إلى وسم</a></main>\n' +
'<footer><nav class="fnav"><a href="/">الرئيسية</a><a href="/about">من نحن</a><a href="/contact">تواصل معنا</a><a href="/privacy">سياسة الخصوصية</a><a href="/terms">الشروط والأحكام</a></nav><div class="fnote">© 2026 وسم — alwasm.net</div></footer>\n' +
'</div>\n</body>\n</html>';
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>غير موجود — وسم</title></head>' +
    '<body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#F4F0E5;color:#20352A">' +
    '<h1>المقال غير موجود</h1><p><a href="/" style="color:#4E7A3A">الرجوع إلى وسم</a></p></body></html>');
}

module.exports = async (req, res) => {
  try {
    let slug = (req.query && req.query.slug) ? req.query.slug : "";
    if (Array.isArray(slug)) slug = slug.join("/");
    slug = String(slug || "").trim();
    if (!slug) { notFound(res); return; }

    const list = await loadArticles();
    const want = slugify(decodeURIComponent(slug));
    let found = null;
    for (let i = 0; i < list.length; i++) {
      if (slugify(list[i].title) === want) { found = list[i]; break; }
    }
    if (!found) { notFound(res); return; }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.end(page(found, want));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="robots" content="noindex"></head><body style="font-family:sans-serif;text-align:center;padding:60px"><p>تعذّر تحميل المقال الآن.</p></body></html>');
  }
};
