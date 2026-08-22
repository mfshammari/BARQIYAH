import type {
  SendImageParams, SendListParams, SendResult, SendTemplateParams, SendTextParams, WhatsAppProvider,
} from './types';

/**
 * مزوّد المحاكاة — يعمل بلا مفاتيح Meta.
 * يسجّل الرسائل في اللوق ويرجع نجاحاً، حتى يكتمل البناء والاختبار
 * قبل اعتماد الرقم لدى Meta. عند إضافة المفاتيح يتحوّل النظام تلقائياً للوضع الحقيقي.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  mode = 'mock' as const;

  private ok(payload: Record<string, unknown>): SendResult {
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (process.env.NODE_ENV !== 'production') {
      console.info('[whatsapp:mock]', messageId, JSON.stringify(payload));
    }
    return { ok: true, messageId, provider: 'mock', payload };
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    return this.ok({ kind: 'template', ...params });
  }

  async sendImage(params: SendImageParams): Promise<SendResult> {
    return this.ok({ kind: 'image', ...params });
  }

  async sendText(params: SendTextParams): Promise<SendResult> {
    return this.ok({ kind: 'text', ...params });
  }

  async sendList(params: SendListParams): Promise<SendResult> {
    return this.ok({ kind: 'list', ...params });
  }
}
