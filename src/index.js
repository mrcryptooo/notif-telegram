const GROUP_USERNAMES = [
  "A3zin",
  "aeonclo",
  "Peymanspr",
  "marziyeh_168",
  "metita98",
  "Kaveh829",
  "Nima2388",
  "rreezzaa098",
  "hasan_trh",
  "Sh4hink",
  "Amirho3yn_hz",
  "Realilidan",
  "Imsarom76",
  "h0sn_m",
  "blockchain1385",
  "moricryptoo",
  "A_Sicilian",
  "hasanasadi_1",
  "Prot3ctor",
  "alifa_eth",
  "Adelalizadeh13",
  "Mahdi_Arshadi",
  "shexter99",
  "nftshay",
  "habibsadi",
  "sama_parsa1",
  "ho3einrezaeii",
  "mohamadjfr57",
  "Crypto_2040",
  "dani97977",
  "Kaveh_niki",
  "mr_gh0st78",
  "Mikaweil1",
  "uan44",
  "sh_yasa74",
  "EMsYazdi",
  "Erfann5427",
  "imyounestaheri",
  "meysamm34m",
  "radman_sistan",
  "missbhz",
  "arsalanmariam",
  "GHODSI_HOSSEIN",
  "Septa_RM",
  "Other_lifee",
  "Parviz_8998",
  "mellyssammp",
  "mousa_ghm",
  "Boshraelteja",
  "David_shah",
  "Armin_Ameriii",
  "Mmdhmoradi",
  "Vhdktz",
  "mahdighu1",
  "rahaaaxr",
  "Predator140",
  "Moha00mm",
  "Kian_klv",
  "mohammadazarpur",
  "Nooeth",
  "Pinktele",
  "Moeinfallah",
  "armin7495",
  "rezaes1371",
  "Skeletonking71",
  "his_mini",
  "L909192"
];
const BATCH_SIZE = 5;
const PAUSE_MS = 1000;
const MAX_USERNAMES = 200;
const MAX_ANNOUNCEMENT_LENGTH = 1000;
const DEFAULT_ANNOUNCEMENT =
  "این یک فرصت یا خبر مهمه؛ چون تگ شدی حتماً چکش کن.";
const USERNAME_RE = /@([A-Za-z0-9_]{5,32})\b/g;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/setup") {
      return new Response(SETUP_HTML, { headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      } });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (request.method === "POST" && url.pathname === "/register-webhook") {
      if (!env.REGISTER_SECRET || request.headers.get("Authorization") !== `Bearer ${env.REGISTER_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const issues = [];
      if (!env.DB || typeof env.DB.prepare !== "function") issues.push("DB: اتصال دیتابیس D1 با نام دقیق DB تنظیم نشده است.");
      if (!env.TELEGRAM_BOT_TOKEN?.trim()) issues.push("TELEGRAM_BOT_TOKEN: توکن بات در Variables and Secrets خود Worker تنظیم نشده است.");
      if (!env.WEBHOOK_SECRET) issues.push("WEBHOOK_SECRET: این Secret در خود Worker تنظیم نشده است.");
      else if (!/^[A-Za-z0-9_-]{1,256}$/.test(env.WEBHOOK_SECRET)) issues.push("WEBHOOK_SECRET: فقط حروف انگلیسی، عدد، خط تیره و زیرخط مجاز است؛ بدون فاصله و حداکثر ۲۵۶ کاراکتر.");
      if (issues.length) {
        return Response.json({ ok: false, error: issues.join("\\n") }, { status: 503 });
      }
      await env.DB.batch([
        env.DB.prepare("CREATE TABLE IF NOT EXISTS group_usernames (chat_id TEXT NOT NULL, username TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (chat_id, username))"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_group_usernames_chat_position ON group_usernames (chat_id, position)"),
        env.DB.prepare("CREATE TABLE IF NOT EXISTS processed_updates (update_id TEXT PRIMARY KEY, status TEXT NOT NULL, last_batch INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0)"),
      ]);
      const result = await telegram(env, "setWebhook", {
        url: new URL("/telegram", url).toString(),
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message"],
      });
      const bot = await telegram(env, "getMe", {});
      const webhook = await telegram(env, "getWebhookInfo", {});
      return Response.json({
        ok: true, result, bot_username: bot.username,
        webhook_url: webhook.url,
        pending_updates: webhook.pending_update_count,
        last_error: webhook.last_error_message || null,
      });
    }

    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.WEBHOOK_SECRET ||
        request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!Number.isSafeInteger(update?.update_id)) {
      return new Response("ok");
    }

    const commandText = update.message?.text || "";
    if (!/^\/(announce|notifhelp)(?:@[A-Za-z0-9_]+)?(?:\\s|$)/i.test(commandText)) {
      return new Response("ok");
    }
    // Help must remain available even when database initialization fails.
    if (/^\/notifhelp(?:@[A-Za-z0-9_]+)?(?:\\s|$)/i.test(commandText)) {
      await handleUpdate(update, env, 0);
      return new Response("ok");
    }
    // A newly provisioned D1 binding may not have the initial schema yet.
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS processed_updates (update_id TEXT PRIMARY KEY, status TEXT NOT NULL, last_batch INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0)"
    ).run();
    const claim = await claimUpdate(env.DB, String(update.update_id));
    if (claim.state === "done" || claim.state === "busy") {
      return new Response("ok");
    }

    try {
      await handleUpdate(update, env, claim.lastBatch);
      await env.DB.prepare(
        "UPDATE processed_updates SET status = 'done', lease_until = 0 WHERE update_id = ?"
      ).bind(String(update.update_id)).run();
      return new Response("ok");
    } catch (error) {
      await env.DB.prepare(
        "UPDATE processed_updates SET lease_until = 0 WHERE update_id = ? AND status = 'running'"
      ).bind(String(update.update_id)).run();
      // Do not log request URLs or Telegram tokens.
      console.error("Update failed:", safeError(error));
      return new Response("Temporary processing error", { status: 500 });
    }
  },
};

async function claimUpdate(db, updateId) {
  const inserted = await db.prepare(
    "INSERT OR IGNORE INTO processed_updates (update_id, status, last_batch, lease_until) VALUES (?, 'running', 0, unixepoch() + 90)"
  ).bind(updateId).run();
  if (inserted.meta?.changes) return { state: "claimed", lastBatch: 0 };

  const reclaimed = await db.prepare(
    "UPDATE processed_updates SET lease_until = unixepoch() + 90 " +
    "WHERE update_id = ? AND status = 'running' AND lease_until < unixepoch() " +
    "RETURNING last_batch"
  ).bind(updateId).all();
  if (reclaimed.results?.length) {
    return { state: "claimed", lastBatch: reclaimed.results[0].last_batch };
  }

  const row = await db.prepare(
    "SELECT status FROM processed_updates WHERE update_id = ?"
  ).bind(updateId).first();
  return { state: row?.status === "done" ? "done" : "busy" };
}

async function handleUpdate(update, env, lastBatch) {
  const message = update.message;
  if (!message?.text || !message.chat || !message.from) return;

  const match = message.text.match(/^\/(announce|notifhelp)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return;

  const command = match[1].toLowerCase();
  const args = (match[2] || "").trim();
  const chat = message.chat;

  if (!["group", "supergroup"].includes(chat.type)) {
    await sendMessage(env, chat.id, "این دستور را داخل گروه اجرا کن.", message);
    return;
  }

  if (command === "notifhelp") {
    await sendMessage(
      env,
      chat.id,
      "فهرست ۶۷ نفر از قبل داخل بات ثبت شده؛ نیازی به /setusers نیست.\n" +
      "برای شروع ارسال: /announce\n" +
      "برای متن دلخواه: /announce متن یک‌خطی خبر\n" +
      "برای ریپلای‌کردن تگ‌ها به خبر، روی همان خبر Reply کن و /announce بفرست.",
      message
    );
    return;
  }

  if (!(await isAdmin(env, chat.id, message.from.id))) {
    await sendMessage(env, chat.id, "این دستور فقط برای مدیران گروه است.", message);
    return;
  }

  const usernames = GROUP_USERNAMES;

  let announcement = args.replace(/\s+/g, " ").trim() || DEFAULT_ANNOUNCEMENT;
  if (announcement.length > MAX_ANNOUNCEMENT_LENGTH) {
    await sendMessage(env, chat.id, "متن اعلان حداکثر ۱۰۰۰ کاراکتر باشد.", message);
    return;
  }

  const batchCount = Math.ceil(usernames.length / BATCH_SIZE);
  const replyTargetId = message.reply_to_message?.message_id;
  for (let batchIndex = lastBatch; batchIndex < batchCount; batchIndex++) {
    const batch = usernames.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
    const text = `${batch.map((username) => `@${username}`).join(" ")}\n\n${announcement}`;
    await sendMessage(env, chat.id, text, message, replyTargetId);
    await env.DB.prepare(
      "UPDATE processed_updates SET last_batch = ?, lease_until = unixepoch() + 90 WHERE update_id = ?"
    ).bind(batchIndex + 1, String(update.update_id)).run();
    if (batchIndex + 1 < batchCount) await delay(PAUSE_MS);
  }

  await sendMessage(
    env,
    chat.id,
    `انجام شد؛ ${usernames.length} نفر در ${batchCount} پیام پنج‌نفره تگ شدند.`,
    message
  );
}

function parseUsernames(raw) {
  const usernames = [];
  const seen = new Set();
  for (const match of raw.matchAll(USERNAME_RE)) {
    const username = match[1];
    const key = username.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      usernames.push(username);
    }
  }
  return usernames;
}

async function isAdmin(env, chatId, userId) {
  const member = await telegram(env, "getChatMember", { chat_id: chatId, user_id: userId });
  return member.status === "administrator" || member.status === "creator";
}

async function sendMessage(env, chatId, text, sourceMessage, replyToId) {
  const body = { chat_id: chatId, text };
  if (sourceMessage?.message_thread_id !== undefined) {
    body.message_thread_id = sourceMessage.message_thread_id;
  }
  if (replyToId !== undefined) {
    body.reply_parameters = { message_id: replyToId };
  } else if (sourceMessage?.message_id !== undefined) {
    body.reply_parameters = { message_id: sourceMessage.message_id };
  }
  return telegram(env, "sendMessage", body);
}

async function telegram(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured.");
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API returned ${response.status}: ${data.description || "request failed"}`);
  }
  return data.result;
}

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SETUP_HTML = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فعال‌سازی بات</title>
<style>body{font:18px system-ui;max-width:520px;margin:60px auto;padding:24px;background:#101820;color:#fff}input,button{box-sizing:border-box;width:100%;padding:14px;margin:10px 0;font:inherit}button{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<h1>فعال‌سازی بات تلگرام</h1><p>مقدار REGISTER_SECRET تنظیم‌شده در Cloudflare را وارد کن. جدول‌های دیتابیس ساخته می‌شوند و اتصال تلگرام فعال می‌شود.</p>
<form><label for="secret">رمز راه‌اندازی</label><input id="secret" type="password" autocomplete="off" required><button>فعال‌سازی بات</button></form><pre id="result" role="status"></pre>
<script>document.querySelector('form').addEventListener('submit',async function(e){e.preventDefault();const s=document.getElementById('secret'),b=document.querySelector('button'),o=document.getElementById('result');b.disabled=true;o.textContent='در حال فعال‌سازی…';try{const r=await fetch('/register-webhook',{method:'POST',headers:{Authorization:'Bearer '+s.value}});s.value='';o.textContent=r.ok?'اتصال ثبت شد. نتیجه بررسی:\\n'+await r.text():'فعال‌سازی ناموفق: '+await r.text()}catch(e){o.textContent='اتصال برقرار نشد؛ دوباره امتحان کن.'}finally{b.disabled=false}});</script></html>`;
