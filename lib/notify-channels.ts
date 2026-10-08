import "server-only";
import type { DispatchMessage } from "@/lib/notify-model";

// Channel senders. Push goes through Expo's public push service (no key needed). SMS and
// WhatsApp are built on Twilio's REST API but stay OFF unless NOTIFY_SMS=on / NOTIFY_WHATSAPP=on
// and the Twilio variables are set; nothing is sent otherwise.

export function channelEnv() {
  const twilio = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  return {
    smsEnabled: process.env.NOTIFY_SMS === "on" && twilio && Boolean(process.env.TWILIO_SMS_FROM),
    whatsappEnabled: process.env.NOTIFY_WHATSAPP === "on" && twilio && Boolean(process.env.TWILIO_WHATSAPP_FROM),
  };
}

export type SendResult = { channel: string; ok: boolean; invalidToken?: string };

export async function sendExpoPush(messages: Extract<DispatchMessage, { channel: "push" }>[]): Promise<SendResult[]> {
  if (messages.length === 0) return [];
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        messages.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, sound: "default" }))
      ),
    });
    if (!res.ok) return messages.map(() => ({ channel: "push", ok: false }));
    const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    return messages.map((m, i) => {
      const ticket = json.data?.[i];
      const dead = ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered";
      return { channel: "push", ok: ticket?.status === "ok", invalidToken: dead ? m.to : undefined };
    });
  } catch {
    return messages.map(() => ({ channel: "push", ok: false }));
  }
}

export async function sendTwilio(message: Extract<DispatchMessage, { channel: "sms" | "whatsapp" }>): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = message.channel === "sms" ? process.env.TWILIO_SMS_FROM : process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { channel: message.channel, ok: false };
  const to = message.channel === "whatsapp" ? `whatsapp:${message.to}` : message.to;
  const sender = message.channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: sender, Body: message.body }).toString(),
    });
    return { channel: message.channel, ok: res.ok };
  } catch {
    return { channel: message.channel, ok: false };
  }
}
