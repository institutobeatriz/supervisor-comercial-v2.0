/**
 * API Service - Dashboard
 * Busca dados reais da API
 */

import { requestJson } from './http';

interface KPIs {
  faturamentoMes: number;
  vendasQtd: number;
  leadsRecebidos: number;
  leadsAtendidos: number;
  leadsPerdidos: number;
  taxaConversao: number;
  ticketMedio: number;
  tempoMedioResposta: string;
  metaMes: number;
  metaAtingida: string;
}

interface FunnelStage {
  status: string;
  qtd: string;
  valor: string;
}

interface Seller {
  id: string;
  name: string;
  total_conversations: string;
  vendas: string;
  faturamento: string;
  qualidade_score: string;
}

interface Conversation {
  id: string;
  contact_name: string;
  contact_phone: string;
  status: string;
  score: number;
  last_message: string;
  last_message_at: string;
}

interface Objection {
  objeção: string;
  count: string;
  resolucao_rate: string;
}

interface FollowUp {
  id: string;
  contact_name: string;
  contact_phone: string;
  score: number;
  temperature: string;
  last_contact: string;
  days_since_contact: string;
}

interface Alert {
  tipo: string;
  titulo: string;
  lead: string;
  acao: string;
  conversationId: string;
}

class DashboardAPI {
  private async fetch<T>(path: string): Promise<T> {
    return requestJson<T>(path);
  }

  async getKPIs(): Promise<KPIs> {
    return this.fetch<KPIs>('/dashboard/kpis');
  }

  async getFunnel(): Promise<FunnelStage[]> {
    return this.fetch<FunnelStage[]>('/dashboard/funnel');
  }

  async getSellers(): Promise<Seller[]> {
    return this.fetch<Seller[]>('/dashboard/sellers');
  }

  async getRecentConversations(): Promise<Conversation[]> {
    return this.fetch<Conversation[]>('/dashboard/conversations/recent');
  }

  async getObjections(): Promise<Objection[]> {
    return this.fetch<Objection[]>('/dashboard/objections');
  }

  async getWinLossReasons(): Promise<{ wins: any[]; losses: any[] }> {
    return this.fetch<{ wins: any[]; losses: any[] }>('/dashboard/win-loss-reasons');
  }

  async getFollowUps(): Promise<FollowUp[]> {
    return this.fetch<FollowUp[]>('/dashboard/followups');
  }

  async getAlerts(): Promise<Alert[]> {
    return this.fetch<Alert[]>('/dashboard/alerts');
  }

  async getDailyEvolution(): Promise<any[]> {
    return this.fetch<any[]>('/dashboard/daily-evolution');
  }
}

export const dashboardAPI = new DashboardAPI();
export type { KPIs, FunnelStage, Seller, Conversation, Objection, FollowUp, Alert };
