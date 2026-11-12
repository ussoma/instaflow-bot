
const TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
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
    const error = await response.text();
    throw new Error(`Supabase error: ${error}`);
  }
}

function getInstagramType(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (
      !["instagram.com", "www.instagram.com", "instagr.am", "www.instagr.am"].includes(host)
    ) {
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
        "📥 Отправь ссылку на Instagram Reels, публикацию или Stories.\n\n" +
        "Бот проверит ссылку и подготовит её к обработке.\n\n" +
        "Используй /help для помощи."
      );

      return res.status(200).json({ ok: true });
    }

    if (text === "/help") {
      await sendMessage(
        chatId,
        "📖 <b>Как пользоваться InstaFlow</b>\n\n" +
        "1. Открой доступную публикацию Instagram.\n" +
        "2. Скопируй ссылку.\n" +
        "3. Отправь её сюда.\n\n" +
        "Поддерживаемые типы ссылок: Reels, Posts и доступные Stories."
      );

      return res.status(200).json({ ok: true });
    }

    if (isInstagramUrl(text)) {
      const type = getInstagramType(text);

      if (!type) {
        await sendMessage(
          chatId,
          "⚠️ Не удалось определить тип публикации.\n\n" +
          "Отправь ссылку на Reels, Post или Stories."
        );

        return res.status(200).json({ ok: true });
      }

      await sendMessage(
        chatId,
        `✅ Ссылка принята!\n\n` +
        `📁 Тип: <b>${type}</b>\n\n` +
        "⚠️ Модуль загрузки ещё не подключён. Ссылка проверена, но видео пока не скачивается.\n\n" +
        "Закрытый или недоступный контент обработать нельзя."
      );

      return res.status(200).json({ ok: true });
    }

    await sendMessage(
      chatId,
      "📥 Отправь ссылку Instagram, чтобы начать."
    );

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(200).json({
      ok: true,
      error: error.message
    });
  }
}
