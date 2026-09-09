// n8n Code node — Run Once for Each Item
const body = $json.body ?? $json;
const data = body.data ?? body;
const key = data.key ?? {};

if (key.fromMe === true) {
  return { json: { ignored: true, reason: 'from_me' } };
}

const remoteJid = key.remoteJid ?? data.remoteJid ?? null;
const message = data.message ?? {};
const text =
  message.conversation ??
  message.extendedTextMessage?.text ??
  message.imageMessage?.caption ??
  message.videoMessage?.caption ??
  data.text ??
  null;

if (!remoteJid) {
  return { json: { ignored: true, reason: 'missing_remote_jid' } };
}

if (!text || !String(text).trim()) {
  return {
    json: {
      ignored: true,
      reason: 'unsupported_or_empty_message',
      remoteJid,
    },
  };
}

const correlationId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

return {
  json: {
    ignored: false,
    correlation_id: correlationId,
    remoteJid,
    pushName: data.pushName ?? null,
    message_id: key.id ?? null,
    text: String(text).trim().slice(0, 4000),
    received_at: new Date().toISOString(),
  },
};
