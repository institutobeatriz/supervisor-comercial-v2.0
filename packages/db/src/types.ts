/**
 * Database Types v2
 * Supervisor Comercial
 */

// ============================================================
// CORE ENTITIES
// ============================================================

export interface Seller {
  id: string;
  name: string;
  active: boolean;
  monthly_goal_cents: number; // Meta mensal em centavos (ex: 5000000 = R$ 50.000,00)
  created_at: Date;
}

export interface Contact {
  id: string;
  phone_e164: string;
  display_name: string | null;
  tags: string[];
  created_at: Date;
}

export interface Conversation {
  id: string;
  contact_id: string;
  seller_id: string;
  status: 'open' | 'closed' | 'pending';
  funnel_stage: 'lead' | 'qualificacao' | 'proposta' | 'fechamento' | 'pos_venda';
  last_message_at: Date | null;
  created_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  seller_id: string | null;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'audio' | 'image' | 'document';
  text: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_sha256: string | null;
  timestamp: Date;
  raw_event: Record<string, unknown>;
  created_at: Date;
  // Extended fields for normalization
  instance_id?: string;
  message_id?: string;
  from_jid?: string;
  to_jid?: string;
  message_type?: string;
  content?: string;
  media_mime_type?: string;
  media_size?: number;
  caption?: string;
  origin?: string;
  is_forwarded?: boolean;
  quoted_message_id?: string;
}

export interface AudioTranscript {
  id: string;
  message_id: string;
  transcript: string;
  confidence: number | null;
  duration_sec: number | null;
  provider: string;
  created_at: Date;
}

export interface MessageLabel {
  id: string;
  message_id: string;
  intent: string;
  objection: string;
  urgency: number; // 0-3
  sentiment: number; // -2 to 2
  funnel_stage: string;
  language: string;
  needs_attention: boolean;
  attention_reason: string;
  created_at: Date;
}

export interface ConversationInsight {
  id: string;
  conversation_id: string;
  quality_score: number; // 0-100
  wins: WinMistake[];
  mistakes: WinMistake[];
  next_best_actions: NextBestAction[];
  summary: string;
  updated_at: Date;
}

export interface WinMistake {
  title: string;
  evidence_msg_ids: string[];
  why?: string;
  impact?: string;
  fix?: string;
}

export interface NextBestAction {
  action: string;
  why: string;
  suggested_text: string;
}

export interface SalesOutcome {
  id: string;
  conversation_id: string;
  outcome: 'won' | 'lost' | 'pending';
  value_cents: number | null;
  loss_reason: string | null;
  updated_at: Date;
}

export interface RagChunk {
  id: string;
  conversation_id: string;
  chunk_text: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ReportDaily {
  report_date: string;
  seller_id: string;
  kpis: Record<string, unknown>;
  heatmap: Record<string, unknown>;
  highlights: Record<string, unknown>;
  created_at: Date;
}

export interface ReportWeekly {
  week_start: string;
  seller_id: string;
  kpis: Record<string, unknown>;
  heatmap: Record<string, unknown>;
  highlights: Record<string, unknown>;
  created_at: Date;
}

// ============================================================
// INSTANCE & EVENT TYPES
// ============================================================

export interface Instance {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  phone?: string;
  created_at?: Date;
}

export interface RawEvent {
  event: string;
  instance: string;
  data: Record<string, unknown>;
  timestamp?: Date;
}

// ============================================================
// INPUT TYPES
// ============================================================

export interface CreateSellerInput {
  name: string;
  active?: boolean;
  monthly_goal_cents?: number; // Meta mensal em centavos (default: 5000000 = R$ 50.000,00)
}

export interface CreateContactInput {
  phone_e164: string;
  display_name?: string;
  tags?: string[];
}

export interface CreateConversationInput {
  contact_id: string;
  seller_id: string;
  status?: 'open' | 'closed' | 'pending';
  funnel_stage?: 'lead' | 'qualificacao' | 'proposta' | 'fechamento' | 'pos_venda';
}

export interface UpsertContactInput {
  phone_e164: string;
  display_name?: string;
  tags?: string[];
}

export interface UpsertConversationInput {
  contact_id: string;
  seller_id: string;
}

export interface InsertMessageInput {
  conversation_id: string;
  seller_id?: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'audio' | 'image' | 'document';
  text?: string;
  media_url?: string;
  media_mime?: string;
  media_sha256?: string;
  timestamp: Date;
  raw_event: Record<string, unknown>;
  whatsapp_message_id?: string;
  raw_event_id?: string;
}

export interface InsertTranscriptInput {
  message_id: string;
  transcript: string;
  confidence?: number;
  duration_sec?: number;
  provider: string;
}

export interface InsertLabelsInput {
  message_id: string;
  intent: string;
  objection: string;
  urgency: number;
  sentiment: number;
  funnel_stage: string;
  language: string;
  needs_attention: boolean;
  attention_reason: string;
}

export interface UpsertConversationInsightsInput {
  conversation_id: string;
  quality_score: number;
  wins: WinMistake[];
  mistakes: WinMistake[];
  next_best_actions: NextBestAction[];
  summary: string;
}

export interface SetOutcomeInput {
  conversation_id: string;
  outcome: 'won' | 'lost' | 'pending';
  value_cents?: number;
  loss_reason?: string;
}

export interface SaveRagChunkInput {
  conversation_id: string;
  chunk_text: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

// ============================================================
// API TYPES
// ============================================================

export interface WebhookPayload {
  event: string;
  instance: string;
  data: Record<string, unknown>;
}

export interface ClassifierOutput {
  intent: string;
  objection: string;
  funnel_stage: string;
  urgency: number;
  sentiment: number;
  language: string;
  needs_attention: boolean;
  attention_reason: string;
}

export interface AnalyzerOutput {
  quality_score: number;
  wins: WinMistake[];
  mistakes: WinMistake[];
  next_best_actions: NextBestAction[];
  summary: string;
}


