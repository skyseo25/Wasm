/**
 * وسم — مساعد زراعي ذكي (Vercel Serverless)
 * المسار: /api/ask  — تستقبل سؤال المستخدم (+ صورة اختيارية) وتردّ بجواب من Anthropic.
 * المفتاح يبقى سرّيًا في الخادم ولا يظهر أبدًا في صفحة الموقع.
 *
 * متغيّر البيئة المطلوب في Vercel:
 *   ANTHROPIC_API_KEY   (موجود مسبقًا)
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 700;
const MAX_Q = 2000;          // أقصى طول للسؤال
const MAX_IMG_B64 = 2600000; // ~2.6MB base64 (حماية من الصور الضخمة)
const ALLOWED_HOSTS = ["wasm-omega.vercel.app", "localhost", "127.0.0.1"];

const CATALOG =
  "الفئات:\n" +
  "- الأسمدة (نقص العناصر، ضعف النمو، تحسين الإثمار): https://q8organic.com/product-category/الاسمدة/\n" +
  "- المغذيات الزراعية (تغذية النبات ونباتات الزينة): https://q8organic.com/product-category/المغذيات-الزراعية/\n" +
  "- الوقاية الزراعية (الآفات والأمراض الفطرية والحشرات والبقع): https://q8organic.com/product-category/الوقاية-الزراعية/\n" +
  "- البذور (بدء زراعة محصول جديد): https://q8organic.com/product-category/البذور/\n" +
  "- الأحواض وصواني البذور (الزراعة في أحواض وإنبات البذور): https://q8organic.com/product-category/الاحواض-وصواني-البذور/\n" +
  "- الأدوات الزراعية (أدوات الزراعة والعناية): https://q8organic.com/product-category/الادوات-الزراعية/\n" +
  "- التايمرات وأدوات الري (جدولة وأنظمة الري): https://q8organic.com/product-category/التايمرات-وادوات-الري/\n" +
  "- أدوات الزراعة المائية (الزراعة المائية): https://q8organic.com/product-category/ادوات-الزراعة-المائية/\n" +
  "منتجات مميزة:\n" +
  "- هيومك أسيد سائل (تحسين التربة وتحفيز الجذور): https://q8organic.com/product/هيومك-اسيد-سائل/\n" +
  "- نترات البوتاسيوم السائل (دعم الإزهار والإثمار ونقص البوتاسيوم): https://q8organic.com/product/نترات-البوتاسيوم-السائل/\n" +
  "- السماد السمكي السائل (تغذية عضوية شاملة لتقوية النمو): https://q8organic.com/product/السماد-السمكي-السائل/\n" +
  "- مغذي نباتات الزينة (تغذية نباتات الزينة المنزلية): https://q8organic.com/product/مغذي-نباتات-الزينة/\n" +
  "- تصفّح كل المنتجات: https://q8organic.com/shop/";

const SYS =
  "أنت «وسم»، مساعد زراعي ذكي متخصص في الزراعة والبستنة في الكويت ودول الخليج. " +
  "تحدّث بالعربية بأسلوب واضح ومبسّط ومختصر. خاطب المستخدم بنفس لهجته: إن كتب بالعامية الكويتية أو الخليجية فردّ بالعامية نفسها بأسلوب ودّي وطبيعي، وإن كتب بالفصحى فردّ بالفصحى. قدّم نصائح عملية تناسب مناخ الكويت الحار وارتفاع الملوحة والتربة الرملية ومياه الري المالحة. " +
  "إذا أرفق المستخدم صورة لنبات، حلّلها وحاول تحديد المشكلة (آفة، مرض فطري، نقص عناصر، إفراط أو نقص ري، حروق شمس أو ملوحة)، واذكر الأسباب المحتملة ثم خطوات علاج آمنة وعملية. " +
  "لا تجزم بتشخيص قاطع؛ اطرح الاحتمالات الأرجح ونبّه أن التشخيص من الصورة تقريبي. " +
  "تجنّب التوصية بمبيدات خطرة أو جرعات دقيقة؛ انصح بالطرق الآمنة أولًا وبمراجعة مختص أو جهة الزراعة عند الحاجة. " +
  "إذا كان السؤال خارج نطاق الزراعة والنبات، اعتذر بلطف ووضّح أنك متخصص بالزراعة. " +
  "اجعل إجاباتك قصيرة ومنظّمة وعملية. " +
  "إذا كان حل مشكلة المستخدم أو سؤاله يتضمّن منتجاً أو فئة متوفرة في متجر كويت أورجانيك ضمن القائمة التالية، فأضف في نهاية ردّك سطراً منفصلاً يبدأ بـ«من متجر كويت أورجانيك:» ثم اسم المنتج أو الفئة الأنسب يليه رابطه كما هو حرفيًا. رشّح بحد أقصى منتجين أو فئتين وفقط عند المناسبة الحقيقية، ولا تقترح شيئًا إن لم يكن مناسبًا، ولا تختلق أي منتج أو رابط خارج القائمة. القائمة:\n" +
  CATALOG;

function hostOf(u) {
  try { return new URL(u).hostname; } catch (e) { return ""; }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  // قراءة يدوية احتياطية
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 6000000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }

  // حماية بسيطة: نسمح فقط لطلبات قادمة من نطاق الموقع (يردع الاستخدام الخارجي)
  const ref = req.headers.origin || req.headers.referer || "";
  if (ref) {
    const h = hostOf(ref);
    const ok = ALLOWED_HOSTS.some((a) => h === a || h.endsWith(".vercel.app"));
    if (!ok) { res.status(403).json({ ok: false, error: "forbidden" }); return; }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ ok: false, error: "no_key" }); return; }

  const body = await readBody(req);
  const question = String(body.question || "").slice(0, MAX_Q).trim();
  const image = body.image && body.image.data && body.image.media_type ? body.image : null;
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  if (!question && !image) { res.status(400).json({ ok: false, error: "empty" }); return; }
  if (image && String(image.data).length > MAX_IMG_B64) { res.status(413).json({ ok: false, error: "image_too_large" }); return; }

  // بناء الرسائل: السياق السابق (نص فقط) + الرسالة الحالية (نص + صورة إن وُجدت)
  const messages = [];
  history.forEach((m) => {
    if (m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string") {
      messages.push({ role: m.role, content: [{ type: "text", text: String(m.text).slice(0, MAX_Q) }] });
    }
  });
  const content = [];
  if (image) {
    content.push({ type: "image", source: { type: "base64", media_type: String(image.media_type), data: String(image.data) } });
  }
  content.push({ type: "text", text: question || "حلّل هذه الصورة لنبات وبيّن المشكلة المحتملة." });
  messages.push({ role: "user", content: content });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYS, messages: messages }),
    });
    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ ok: false, error: "upstream", detail: t.slice(0, 200) });
      return;
    }
    const data = await r.json();
    let txt = "";
    (data.content || []).forEach((b) => { if (b.type === "text") txt += b.text; });
    res.status(200).json({ ok: true, reply: txt.trim() || "ما قدرت أجاوب الحين، حاول مرة ثانية." });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
