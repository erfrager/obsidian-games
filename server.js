const express = require("express");
const crypto = require("crypto");

const TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

// اسم کوتاه بازی در BotFather  ->  آدرس صفحه بازی
const GAMES = {
  obsidian_spider: "/spider/",
};

if (!TOKEN) {
  console.error("BOT_TOKEN is missing");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const SECRET = crypto.createHash("sha256").update(TOKEN).digest("hex").slice(0, 32);

function sign(text) {
  return crypto.createHmac("sha256", TOKEN).update(text).digest("hex").slice(0, 32);
}

async function tg(method, body) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) console.error(method, j);
  return j;
}

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => res.send("OBSIDIAN games bot is running"));

// دریافت پیام‌ها از تلگرام
app.post(`/webhook/${SECRET}`, async (req, res) => {
  res.sendStatus(200);
  const u = req.body;
  try {
    if (u.inline_query) {
      await tg("answerInlineQuery", {
        inline_query_id: u.inline_query.id,
        cache_time: 0,
        results: Object.keys(GAMES).map((name, i) => ({
          type: "game",
          id: String(i),
          game_short_name: name,
        })),
      });
    } else if (u.callback_query && u.callback_query.game_short_name) {
      const q = u.callback_query;
      const path = GAMES[q.game_short_name];
      if (!path) return;
      const uid = q.from.id;
      const where = q.inline_message_id
        ? `i:${q.inline_message_id}`
        : `c:${q.message.chat.id}:${q.message.message_id}`;
      const sig = sign(`${uid}|${where}`);
      const url = `${BASE_URL}${path}?u=${uid}&w=${encodeURIComponent(where)}&s=${sig}`;
      await tg("answerCallbackQuery", { callback_query_id: q.id, url });
    }
  } catch (e) {
    console.error(e);
  }
});

// ثبت امتیاز
app.post("/score", async (req, res) => {
  const { u, w, s, score } = req.body || {};
  if (!u || !w || !s || sign(`${u}|${w}`) !== s) {
    return res.status(403).json({ ok: false });
  }
  const n = Math.floor(Number(score));
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    return res.status(400).json({ ok: false });
  }
  const p = String(w).split(":");
  const body = { user_id: Number(u), score: n };
  if (p[0] === "i") {
    body.inline_message_id = p.slice(1).join(":");
  } else {
    body.chat_id = Number(p[1]);
    body.message_id = Number(p[2]);
  }
  const r = await tg("setGameScore", body);
  res.json({ ok: r.ok });
});

app.listen(PORT, async () => {
  console.log("Server started on port", PORT);
  if (BASE_URL) {
    await tg("setWebhook", {
      url: `${BASE_URL}/webhook/${SECRET}`,
      allowed_updates: ["inline_query", "callback_query"],
    });
  }
});
