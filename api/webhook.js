
const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const RAPIDAPI_HOST = "instagram-reels-downloader-api.p.rapidapi.com";

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

function getInstagramType(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (![
      "instagram.com",
      "www.instagram.com",
      "instagr.am",
      "www.instagr.am"
    ].includes(host)) {
      return null;
    }

    const path = parsed.pathname;

    if (/\/reel\//i.test(path)) return "Reels";
    if (/\/p\//i.test(path)) return "Posts";
    if (/\/stories\//i.test(path)) return "Stories";
    if (/\/tv\//i.test(path)) return "Instagram videos";

    return null;
  } catch {
    return null;
  }
}

async function downloadReel(instagramUrl) {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY is missing");
  }

  const apiUrl = new URL(
    `https://${RAPIDAPI_HOST}/download`
  );

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
    throw new Error(
      result.message || "Instagram download API failed"
    );
  }

  const medias = result.data?.medias || [];

  const video = medias.find(
    media => media.type === "video" && media.url
  );

  if (!video) {
    throw new Error("Видео в ответе API найдено не было");
  }

  return {
    videoUrl: video.url,
    title: result.data?.title || "Instagram Reel",
    author: result.data?.author || ""
  };
}

async function sendVideo(chatId, videoUrl) {
  return telegram("sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    supports_streaming: true,
    caption: "✅ Видео успешно загружено через InstaFlow!"
  });
}

function isInstagramUrl(text) {
  try {
    const url = new URL(text);

    return [
      "instagram.com",
      "www.instagram.com",
      "instagr.am",
      "www.instagr.am"
    ].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

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
      await registerUser(user);
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
      await sendMessage(
        chatId,
        "📥 Отправь корректную ссылку Instagram."
      );

      return res.status(200).json({ ok: true });
    }

    const type = getInstagramType(text);

    if (!type) {
      await sendMessage(
        chatId,
        "⚠️ Не удалось определить тип публикации."
      );

      return res.status(200).json({ ok: true });
    }

    if (type !== "Reels") {
      await sendMessage(
        chatId,
        "⚠️ Сейчас поддерживаются только Instagram Reels.\n\n" +
        "Поддержка Posts и Stories будет добавлена отдельно."
      );

      return res.status(200).json({ ok: true });
    }

    await sendMessage(
      chatId,
      "⏳ <b>Загружаю видео...</b>\n\nПожалуйста, подожди."
    );

    const result = await downloadReel(text);

    await sendVideo(chatId, result.videoUrl);

    return res.status(200).json({
      ok: true,
      downloaded: true
    });

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
          "Возможно, ссылка недоступна или API временно не работает."
        );
      }
    } catch (sendError) {
      console.error("Telegram error:", sendError);
    }

    return res.status(200).json({
      ok: true,
      error: error.message
    });
  }
}
