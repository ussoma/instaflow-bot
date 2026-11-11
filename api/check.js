
export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      success: false,
      problem: "BOT_TOKEN is missing in Vercel"
    });
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getMe`
    );

    const data = await response.json();

    return res.status(200).json({
      http_status: response.status,
      telegram_ok: data.ok,
      bot_name: data.result?.first_name || null,
      username: data.result?.username || null,
      error_code: data.error_code || null,
      description: data.description || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      problem: error.message
    });
  }
}
