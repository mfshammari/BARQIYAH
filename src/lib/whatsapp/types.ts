export type WhatsAppMode = 'mock' | 'meta';

export interface SendTemplateParams {
  to: string;                       // رقم بصيغة E.164 بدون +
  templateName: string;             // اسم القالب المعتمد في Meta
  languageCode?: string;            // ar افتراضياً
  headerImageUrl?: string | null;   // صورة رأس القالب
  bodyParams: string[];             // {{1}}, {{2}} …
  buttonPayloads?: { accept: string; decline: string }; // payload لأزرار الرد السريع
}

export interface SendImageParams {
  to: string;
  imageUrl: string;
  caption?: string;
}

export interface SendTextParams {
  to: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  provider: WhatsAppMode;
  payload?: Record<string, unknown>;
}

export interface WhatsAppProvider {
  mode: WhatsAppMode;
  sendTemplate(params: SendTemplateParams): Promise<SendResult>;
  sendImage(params: SendImageParams): Promise<SendResult>;
  sendText(params: SendTextParams): Promise<SendResult>;
}

/** رد المدعو المستخرج من webhook. */
export interface InboundReply {
  from: string;                 // رقم المرسل
  messageId: string;
  kind: 'accept' | 'decline' | 'text' | 'unknown';
  buttonPayload?: string;
  text?: string;
}
