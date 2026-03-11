/**
 * Notificações Telegram
 * Envia alertas quando há revisões pendentes
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export interface NotificationPayload {
  conversationId: string;
  contactName?: string;
  suggestedOutcome: string;
  valueCents?: number;
  reason: string;
  reviewId: string;
}

export async function sendReviewNotification(payload: NotificationPayload): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[NOTIFY] Telegram not configured, skipping notification');
    return;
  }

  const value = payload.valueCents 
    ? `R$ ${(payload.valueCents / 100).toFixed(2)}` 
    : 'N/A';
  
  const outcome = payload.suggestedOutcome === 'won' ? '🟢 VENDA' : '🔴 PERDA';
  
  const message = `🚨 *Revisão Humana Necessária*

👤 *Contato:* ${payload.contactName || 'Desconhecido'}
📋 *Tipo:* ${outcome}
💰 *Valor:* ${value}
📝 *Motivo:* ${payload.reason}

[Ver no Dashboard](http://localhost:3001)`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      console.error('[NOTIFY] Failed to send Telegram notification:', await response.text());
    } else {
      console.log('[NOTIFY] Telegram notification sent');
    }
  } catch (error) {
    console.error('[NOTIFY] Error sending notification:', error);
  }
}
