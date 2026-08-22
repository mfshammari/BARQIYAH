import type {
  SendImageParams, SendResult, SendTemplateParams, SendTextParams, WhatsAppProvider,
} from './types';

const GRAPH_VERSION = 'v21.0';

export interface MetaCredentials {
  phoneNumberId: string;
  accessToken: string;
}

/** مزوّد Meta Cloud API المباشر (بدون BSP) — رقم واحد مملوك للمنصة. */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  mode = 'meta' as const;

  constructor(private creds: MetaCredentials) {}

  private get endpoint(): string {
    return `https://graph.facebook.com/${GRAPH_VERSION}/${this.creds.phoneNumberId}/messages`;
  }

  private async post(body: Record<string, unknown>): Promise<SendResult> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      };

      if (!res.ok || json.error) {
        return {
          ok: false,
          provider: 'meta',
          error: json.error?.message ?? `HTTP ${res.status}`,
          payload: body,
        };
      }
      return {
        ok: true,
        provider: 'meta',
        messageId: json.messages?.[0]?.id,
        payload: body,
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'meta',
        error: err instanceof Error ? err.message : 'خطأ غير متوقع في الاتصال بـ Meta',
        payload: body,
      };
    }
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    const components: Record<string, unknown>[] = [];

    if (params.headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: params.headerImageUrl } }],
      });
    }
    if (params.bodyParams.length) {
      components.push({
        type: 'body',
        parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
      });
    }
    // أزرار الرد السريع: الـ payload يحمل توكن الدعوة لربط الرد بالمدعو
    if (params.buttonPayloads) {
      components.push({
        type: 'button', sub_type: 'quick_reply', index: '0',
        parameters: [{ type: 'payload', payload: params.buttonPayloads.accept }],
      });
      components.push({
        type: 'button', sub_type: 'quick_reply', index: '1',
        parameters: [{ type: 'payload', payload: params.buttonPayloads.decline }],
      });
    }

    return this.post({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.languageCode ?? 'ar' },
        components,
      },
    });
  }

  async sendImage(params: SendImageParams): Promise<SendResult> {
    return this.post({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'image',
      image: { link: params.imageUrl, caption: params.caption },
    });
  }

  async sendText(params: SendTextParams): Promise<SendResult> {
    return this.post({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: { body: params.text, preview_url: false },
    });
  }
}
