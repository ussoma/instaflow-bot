const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; // теперь необязательный: используется только как запасной вариант

const RAPIDAPI_HOST = "instagram-reels-downloader-api.p.rapidapi.com";

const INSTAGRAM_HOSTS = [
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am"
];

// ---------- Telegram ----------

async function telegram(method, body) {
  const response = await fetch(
    `https://api.telegram.org/bot${TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || "Telegram API error");
  }

  return data;
}

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function sendVideo(chatId, videoUrl) {
  return telegram("sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    supports_streaming: true,
    caption: "✅ Видео успешно загружено через InstaFlow!"
  });
}

// ---------- Supabase ----------

async function registerUser(user) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !user?.id) {
    throw new Error("Supabase configuration is missing");
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/register_bot_user`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        p_telegram_id: user.id,
        p_username: user.username || null,
        p_first_name: user.first_name || null,
        p_last_name: user.last_name || null
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase error: ${await response.text()}`);
  }
}

// ---------- Ссылки Instagram ----------

function isInstagramUrl(text) {
  try {
    const url = new URL(text);
    return INSTAGRAM_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function getInstagramType(url) {
  try {
    const parsed = new URL(url);
    if (!INSTAGRAM_HOSTS.includes(parsed.hostname.toLowerCase())) return null;

    const path = parsed.pathname;

    if (/\/reels?\//i.test(path)) return "Reels";
    if (/\/p\//i.test(path)) return "Posts";
    if (/\/stories\//i.test(path)) return "Stories";
    if (/\/tv\//i.test(path)) return "Instagram videos";

    return null;
  } catch {
    return null;
  }
}

function getShortcode(url) {
  const match = new URL(url).pathname.match(
    /\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i
  );
  return match ? match[1] : null;
}

// ---------- Способ 1: напрямую через Instagram (бесплатно, без лимита API) ----------

async function downloadDirect(instagramUrl) {
  const shortcode = getShortcode(instagramUrl);
  if (!shortcode) throw new Error("Не удалось получить shortcode из ссылки");

  const lsd = "AVqbxe3J_YA";

  const body = new URLSearchParams({
    av: "0",
    __d: "www",
    __user: "0",
    __a: "1",
    __req: "3",
    dpr: "2",
    __ccg: "UNKNOWN",
    lsd,
    jazoest: "2957",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "PolarisPostActionLoadPostQueryQuery",
    variables: JSON.stringify({
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null
    }),
    server_timestamps: "true",
    // Если Instagram однажды поменяет doc_id, способ 1 перестанет работать,
    // и бот автоматически перейдёт на RapidAPI (способ 2).
    doc_id: "8845758582119845"
  });

  const response = await fetch("https://www.instagram.com/graphql/query", {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-IG-App-ID": "936619743392459",
      "X-FB-LSD": lsd,
      "X-ASBD-ID": "129477",
      "Sec-Fetch-Site": "same-origin",
      Referer: `https://www.instagram.com/reel/${shortcode}/`,
      Origin: "https://www.instagram.com"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Instagram ответил статусом ${response.status}`);
  }

  const json = await response.json();
  const media = json?.data?.xdt_shortcode_media;

  if (!media) throw new Error("Instagram не вернул данные о публикации");
  if (!media.is_video || !media.video_url) {
    throw new Error("В публикации нет видео");
  }

  return {
    videoUrl: media.video_url,
    title: media.edge_media_to_caption?.edges?.[0]?.node?.text || "Instagram Reel",
    author: media.owner?.username || ""
  };
}

// ---------- Способ 2: RapidAPI (запасной, с лимитом тарифа) ----------

async function downloadViaRapidApi(instagramUrl) {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY is missing");
  }

  const apiUrl = new URL(`https://${RAPIDAPI_HOST}/download`);
  apiUrl.searchParams.set("url", instagramUrl);

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": RAPIDAPI_KEY
    }
  });

  const result = await response.json();

  if (!response.ok || result.error || result.success === false) {
    throw new Error(result.message || "Instagram download API failed");
  }

  const medias = result.data?.medias || [];
  const video = medias.find(m => m.type === "video" && m.url);

  if (!video) {
    throw new Error("Видео в ответе API найдено не было");
  }

  return {
    videoUrl: video.url,
    title: result.data?.title || "Instagram Reel",
    author: result.data?.author || ""
  };
}

// Сначала бесплатный способ, при ошибке — RapidAPI
async function downloadReel(instagramUrl) {
  try {
    return await downloadDirect(instagramUrl);
  } catch (directError) {
    console.warn("Direct download failed:", directError.message);

    if (!RAPIDAPI_KEY) throw directError;

    return await downloadViaRapidApi(instagramUrl);
  }
}

// ---------- Webhook ----------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  if (!TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      success: false,
      problem: "Missing environment variables"
    });
  }

  try {
    const update = req.body;
    const message = update?.message || update?.edited_message;

    if (!message?.chat?.id) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const user = message.from;
    const text = (message.text || "").trim();

    if (user) {
      try {
        await registerUser(user);
      } catch (e) {
        // ошибка базы не должна мешать скачиванию
        console.error("registerUser failed:", e.message);
      }
    }

    if (text === "/start") {
      await sendMessage(
        chatId,
        "👋 <b>Добро пожаловать в InstaFlow!</b>\n\n" +
        "📥 Отправь ссылку на Instagram Reels.\n\n" +
        "Бот загрузит доступное видео и отправит его сюда.\n\n" +
        "Используй /help для помощи."
      );
      return res.status(200).json({ ok: true });
    }

    if (text === "/help") {
      await sendMessage(
        chatId,
        "📖 <b>Как пользоваться InstaFlow</b>\n\n" +
        "1. Открой доступный Instagram Reel.\n" +
        "2. Скопируй ссылку.\n" +
        "3. Отправь её боту.\n\n" +
        "Сейчас подключена загрузка Reels."
      );
      return res.status(200).json({ ok: true });
    }

    if (!isInstagramUrl(text)) {
      await sendMessage(chatId, "📥 Отправь корректную ссылку Instagram.");
      return res.status(200).json({ ok: true });
    }

    const type = getInstagramType(text);

    if (!type) {
      await sendMessage(chatId, "⚠️ Не удалось определить тип публикации.");
      return res.status(200).json({ ok: true });
    }

    if (type !== "Reels" && type !== "Posts" && type !== "Instagram videos") {
      await sendMessage(
        chatId,
        "⚠️ Сейчас поддерживаются только видео (Reels и видео-посты).\n\n" +
        "Поддержка Stories будет добавлена отдельно."
      );
      return res.status(200).json({ ok: true });
    }

    await sendMessage(
      chatId,
      "⏳ <b>Загружаю видео...</b>\n\nПожалуйста, подожди."
    );

    const result = await downloadReel(text);

    await sendVideo(chatId, result.videoUrl);

    return res.status(200).json({ ok: true, downloaded: true });

  } catch (error) {
    console.error("Webhook error:", error);

    try {
      const chatId =
        req.body?.message?.chat?.id ||
        req.body?.edited_message?.chat?.id;

      if (chatId) {
        await sendMessage(
          chatId,
          "❌ Не удалось загрузить видео.\n\n" +
          "Возможно, аккаунт закрытый, ссылка недоступна или Instagram временно ограничил запросы. Попробуй ещё раз через минуту."
        );
      }
    } catch (sendError) {
      console.error("Telegram error:", sendError);
    }

    return res.status(200).json({ ok: true, error: error.message });
  }
}