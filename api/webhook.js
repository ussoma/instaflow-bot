
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("InstaFlow Bot is running!");
  }

  const TOKEN = process.env.BOT_TOKEN;

  if (!TOKEN) {
    return res.status(500).send("Bot token is missing");
  }

  const update = req.body;
  const message = update?.message;

  if (!message?.chat?.id) {
    return res.status(200).send("OK");
  }

  const chatId = message.chat.id;
  const text = message.text?.trim() || "";

  async function sendMessage(reply) {
    return fetch(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply
        })
      }
    );
  }

  if (text === "/start") {
    await sendMessage(
      "👋 Салом! Ба InstaFlow хуш омадед.\n\n🔗 Ссылкаи Instagram-ро фиристед."
    );
    return res.status(200).send("OK");
  }

  if (/https?:\/\/(www\.)?instagram\.com\//i.test(text)) {
    await sendMessage(
      "⏳ Ссылка қабул шуд!\n\nҲоло хидмати зеркашии видеоро пайваст мекунем."
    );
    return res.status(200).send("OK");
  }

  await sendMessage(
    "❌ Лутфан ссылкаи дурусти Instagram-ро фиристед."
  );

  return res.status(200).send("OK");
}
