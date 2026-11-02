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

/** قائمة تفاعلية لاختيار عدد الحاضرين (Meta interactive list). */
export interface SendListParams {
  to: string;
  header?: string;
  body: string;
  footer?: string;
  buttonLabel: string;
  rows: { id: string; title: string; description?: string }[];
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
  sendList(params: SendListParams): Promise<SendResult>;
}

/** رد المدعو المستخرج من webhook. */
export interface InboundReply {
  from: string;                 // رقم المرسل
  messageId: string;
  kind: 'accept' | 'decline' | 'seats' | 'text' | 'unknown';
  buttonPayload?: string;
  /** عدد الحاضرين المختار من القائمة التفاعلية */
  seats?: number;
  text?: string;
  /** معرّف الرسالة الأصلية التي يردّ عليها (context.id) — للربط بـ message_logs */
  contextId?: string;
}

/** تحديث حالة رسالة صادرة كما تبلّغه Meta (statuses[]). */
export interface MessageStatusUpdate {
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  recipient?: string;
  errorCode?: string;
  errorTitle?: string;
}

export interface WebhookEvents {
  replies: InboundReply[];
  statuses: MessageStatusUpdate[];
}
