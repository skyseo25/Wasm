/**
 * وسم — وظيفة جلب الأخبار (Vercel Cron)
 * المسار: /api/fetch-news  — يشغّلها Vercel Cron كل 6 ساعات (انظر vercel.json)
 * تسحب أخبار الزراعة/المزارعين/الثروة الحيوانية في الكويت من الجرايد عبر Google News RSS،
 * تختصرها وتعيد صياغتها عبر Anthropic، تحذف المكرر، تخزّنها في wsm_news، وتنظّف ما عمره >7 أيام.
 *
 * متغيّرات البيئة المطلوبة في Vercel:
 *   ANTHROPIC_API_KEY        مفتاح Anthropic
 *   FIREBASE_SERVICE_ACCOUNT محتوى ملف مفتاح الخدمة (JSON كامل بسطر واحد)
 *   CRON_SECRET              (اختياري لكن مُستحسن) سرّ يحمي المسار من التشغيل العشوائي
 */

const crypto = require("crypto");
const admin = require("firebase-admin");
const { XMLParser } = require("fast-xml-parser");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NEW_PER_RUN = 10;
const COLLECTION = "wsm_news";
const MODEL = "claude-haiku-4-5-20251001"; // نموذج اقتصادي للتلخيص

const SITES = ["alqabas.com", "alanba.com.kw", "alraimedia.com", "al-seyassah.com"];
const KEYWORDS = [
  "الزراعة", "زراعة", "زراعي", "مزارع", "مزارعين", "مزرعة", "محاصيل", "محصول",
  "النخيل", "نخيل", "تمور", "بذور", "الري", "الثروة الحيوانية", "مواشي", "ماشية",
  "أغنام", "أبقار", "دواجن", "الأمن الغذائي", "الزراعة العضوية", "المحميات الطبيعية",
  "هيئة الزراعة", "شؤون الزراعة", "الإنتاج الحيواني", "العلف", "الصيد",
];

// ===== Firestore (Admin) =====
function getDb() {
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin.firestore();
}

// ===== أدوات =====
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
function toArray(x) { return x ? (Array.isArray(x) ? x : [x]) : []; }
function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function titleSig(t) {
  const norm = String(t || "")
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[إأآا]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, " ").replace(/\s+/g, " ").trim();
  return sha1(norm.split(" ").filter(Boolean).slice(0, 6).join(" "));
}
function matchesKeywords(text) {
  const t = String(text || "");
  return KEYWORDS.some((k) => t.indexOf(k) >= 0);
}

// فلتر الكويت: نُبقي الخبر فقط إذا كان كويتيًا (نص فيه «كويت» أو مصدره جريدة كويتية)
const KUWAIT_HINTS = ["كويت", "القبس", "الأنباء", "الراي", "السياسة", "كونا", "الجريدة"];
function isKuwait(it) {
  const t = (it.title || "") + " " + (it.desc || "") + " " + (it.source || "");
  return KUWAIT_HINTS.some((h) => t.indexOf(h) >= 0);
}
function buildQuery() {
  // كلمات الزراعة/الثروة الحيوانية + الكويت، آخر أسبوع — استعلام مركّز وموثوق
  var kw = [
    '"الثروة الحيوانية"', "الزراعة", "المزارعين", "المحاصيل",
    "النخيل", "المواشي", "الدواجن", '"الأمن الغذائي"', "الزراعي",
  ].join(" OR ");
  return "(" + kw + ") الكويت when:7d";
}
function feedUrl() {
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(buildQuery()) + "&hl=ar&gl=KW&ceid=KW:ar";
}

async function fetchFeed() {
  const res = await fetch(feedUrl(), { headers: { "User-Agent": "Mozilla/5.0 (compatible; WasmNewsBot/1.0)" } });
  if (!res.ok) throw new Error("RSS HTTP " + res.status);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const data = parser.parse(xml);
  const items = toArray(data && data.rss && data.rss.channel && data.rss.channel.item);
  return items.map((it) => {
    const src = it.source || {};
    return {
      title: stripHtml(it.title),
      link: it.link || "",
      desc: stripHtml(it.description),
      source: (typeof src === "object" ? src["#text"] || "" : src) || "",
      pub: it.pubDate ? Date.parse(it.pubDate) : Date.now(),
    };
  });
}

async function summarize(item, apiKey) {
  const sys =
    "أنت محرر أخبار زراعية كويتي. أعد صياغة الخبر بأسلوبك الخاص بالعربية الفصحى المبسطة. " +
    "لا تنسخ أي نص حرفيًا. أعد عنوانًا مختصرًا (أقل من 12 كلمة) وملخصًا من جملتين إلى ثلاث جمل. " +
    'صنّف الخبر ضمن: "زراعة" أو "ثروة حيوانية" أو "مزارعون" أو "أمن غذائي" أو "عام". ' +
    'أجب بصيغة JSON فقط بلا أي نص إضافي: {"title":"...","summary":"...","cat":"..."}';
  const user = "العنوان الأصلي: " + item.title + "\nمقتطف: " + (item.desc || "") + "\nالمصدر: " + (item.source || "");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system: sys, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error("Anthropic HTTP " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  let txt = "";
  (data.content || []).forEach((b) => { if (b.type === "text") txt += b.text; });
  txt = txt.replace(/```json|```/g, "").trim();
  let parsed;
  try { parsed = JSON.parse(txt); }
  catch (e) { const m = txt.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
  if (!parsed || !parsed.title) return null;
  return {
    title: String(parsed.title).slice(0, 160),
    summary: String(parsed.summary || "").slice(0, 600),
    cat: String(parsed.cat || "عام").slice(0, 30),
  };
}

// ===== المعالج =====
module.exports = async (req, res) => {
  // حماية المسار: Vercel Cron يرسل Authorization: Bearer <CRON_SECRET> تلقائيًا إذا ضُبط
  if (process.env.CRON_SECRET) {
    if (req.headers["authorization"] !== "Bearer " + process.env.CRON_SECRET) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
  }
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY مفقود");
    const db = getDb();
    const now = Date.now();

    // تحميل الموجود + تنظيف القديم
    const snap = await db.collection(COLLECTION).get();
    const seenUrls = new Set(), seenSigs = new Set();
    const batch = db.batch(); let oldCount = 0;
    snap.forEach((doc) => {
      const x = doc.data() || {}; const ts = typeof x.ts === "number" ? x.ts : 0;
      if (ts && now - ts > WEEK_MS) { batch.delete(doc.ref); oldCount++; }
      else { if (x.url) seenUrls.add(x.url); if (x.sig) seenSigs.add(x.sig); }
    });
    if (oldCount > 0) await batch.commit();

    // سحب
    const items = await fetchFeed();

    // وضع التشخيص: ?debug=1 يرجّع عيّنة من الأخبار الواصلة بدون فلترة
    const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");
    if (debug) {
      res.status(200).json({
        ok: true, debug: true, received: items.length,
        sample: items.slice(0, 12).map((x) => ({ title: x.title, source: x.source })),
      });
      return;
    }

    // فلترة + إزالة المكرر
    const fresh = [];
    for (const it of items) {
      if (!it.title || !it.link) continue;
      if (it.pub && now - it.pub > WEEK_MS) continue;
      if (!matchesKeywords(it.title + " " + it.desc)) continue;
      if (!isKuwait(it)) continue;                                // الكويت فقط
      const id = sha1(it.link), sig = titleSig(it.title);
      if (seenUrls.has(it.link) || seenSigs.has(sig)) continue;
      seenUrls.add(it.link); seenSigs.add(sig);
      fresh.push({ id, sig, item: it });
      if (fresh.length >= MAX_NEW_PER_RUN) break;
    }

    // تلخيص + تخزين
    let added = 0;
    for (const f of fresh) {
      try {
        const s = await summarize(f.item, apiKey);
        if (!s) continue;
        await db.collection(COLLECTION).doc(f.id).set({
          title: s.title, summary: s.summary, cat: s.cat,
          source: f.item.source || "أخبار", url: f.item.link,
          sig: f.sig, ts: now, on: true,
        });
        added++;
      } catch (e) { /* تخطّي الخبر الفاشل */ }
    }

    res.status(200).json({ ok: true, received: items.length, processed: fresh.length, added: added, removedOld: oldCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
