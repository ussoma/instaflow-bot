async function sendVideo(videoUrl) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoUrl,
      caption: "✅ Видео тайёр"
    })
  });
}
