/**
 * useDashboardData - Hook para buscar dados da API
 */

import { useState, useEffect } from 'react';
import { dashboardAPI } from '../services/api';

export function useDashboardData() {
  const [kpis, setKPIs] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [objections, setObjections] = useState([]);
  const [winLossReasons, setWinLossReasons] = useState({ wins: [], losses: [] });
  const [followUps, setFollowUps] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [
        kpisData,
        funnelData,
        sellersData,
        conversationsData,
        objectionsData,
        winLossData,
        followUpsData,
        alertsData,
      ] = await Promise.all([
        dashboardAPI.getKPIs().catch(() => null),
        dashboardAPI.getFunnel().catch(() => []),
        dashboardAPI.getSellers().catch(() => []),
        dashboardAPI.getRecentConversations().catch(() => []),
        dashboardAPI.getObjections().catch(() => []),
        dashboardAPI.getWinLossReasons().catch(() => ({ wins: [], losses: [] })),
        dashboardAPI.getFollowUps().catch(() => []),
        dashboardAPI.getAlerts().catch(() => []),
      ]);

      setKPIs(kpisData);
      setFunnel(funnelData);
      setSellers(sellersData);
      setConversations(conversationsData);
      setObjections(objectionsData);
      setWinLossReasons(winLossData);
      setFollowUps(followUpsData);
      setAlerts(alertsData);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Dashboard data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh a cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    kpis,
    funnel,
    sellers,
    conversations,
    objections,
    winLossReasons,
    followUps,
    alerts,
    loading,
    error,
    refetch: fetchData,
  };
}

// Hook para dados específicos
export function useKPIs() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.getKPIs()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}

export function useAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetchAlerts = () => {
      dashboardAPI.getAlerts().then(setAlerts).catch(console.error);
    };
    
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000); // Alertas a cada 10s
    return () => clearInterval(interval);
  }, []);

  return alerts;
}
