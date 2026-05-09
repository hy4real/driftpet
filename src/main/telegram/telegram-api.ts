type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
};

const TELEGRAM_API_BASE = "https://api.telegram.org";

export const sendTelegramMessage = async (
  token: string,
  chatId: number,
  text: string,
  replyToMessageId?: number | null
): Promise<void> => {
  const send = async (includeReply: boolean): Promise<void> => {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(includeReply && typeof replyToMessageId === "number" ? { reply_to_message_id: replyToMessageId } : {}),
        disable_web_page_preview: true
      })
    });

    const payload = await response.json() as TelegramSendMessageResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.description ?? `Telegram sendMessage failed with HTTP ${response.status}.`);
    }
  };

  try {
    await send(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      typeof replyToMessageId === "number"
      && /reply.*not found|message to be replied not found/i.test(message)
    ) {
      await send(false);
      return;
    }

    throw error;
  }
};
