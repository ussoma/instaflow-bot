// Тест: открой в браузере
// https://ТВОЙ-ПРОЕКТ.vercel.app/api/test-instagram?url=https://www.instagram.com/reel/XXXXXXX/

export default async function handler(req, res) {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ ok: false, problem: "Добавь ?url=ссылка_на_reel" });
  }

  const match = url.match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) {
    return res.status(400).json({ ok: false, problem: "Не удалось найти shortcode в ссылке" });
  }

  const shortcode = match[1];
  const lsd = "AVqbxe3J_YA";

  const body = new URLSearchParams({
    av: "0", __d: "www", __user: "0", __a: "1", __req: "3", dpr: "2",
    __ccg: "UNKNOWN", lsd, jazoest: "2957",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "PolarisPostActionLoadPostQueryQuery",
    variables: JSON.stringify({
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null
    }),
    server_timestamps: "true",
    doc_id: "8845758582119845"
  });

  try {
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

    const raw = await response.text();
    let json = null;
    try { json = JSON.parse(raw); } catch {}

    const media = json?.data?.xdt_shortcode_media;

    return res.status(200).json({
      http_status: response.status,
      shortcode,
      found_media: Boolean(media),
      is_video: media?.is_video ?? null,
      author: media?.owner?.username ?? null,
      video_url: media?.video_url ?? null,
      // если не сработало — первые 500 символов ответа Instagram для диагностики
      raw_preview: media ? null : raw.slice(0, 500)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, problem: error.message });
  }
}