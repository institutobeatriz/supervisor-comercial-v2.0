/**
 * @supervisor/db
 * Database layer for Supervisor Comercial
 */

export { getPool, query, getClient, transaction, ping, close, db } from './pool.js';
export { migrate, reset, seed } from './migrate.js';
export * from './types.js';
export * from './queries.js';

// Explicit re-exports for dashboard
export {
  getDefaultSeller,
  getSellerById,
  getSellerByInstance,
  getWeeklyReport,
  getExecutiveKpis,
  getLeadsByTemperature,
  getDailyEvolution,
  getFunnelStages,
  getConversionByStage,
  getLossReasons,
  getSellerRanking,
  getConversationMetrics,
  getObjectionsDetected,
  getFollowupStats,
  getConversationsNeedingFollowup,
  // Funcoes avancadas com filtros de periodo
  getSellerPerformanceFull,
  getLossStats,
  getSellerDetailedAnalysis,
  getFollowupFull,
  getFollowupHistory,
  getObjectionResolutionRate,
  getPendingReviews,
  getReviewById,
  approveReview,
  rejectReview,
  getReviewStats,
  // Human review
  createHumanReview,
} from './queries.js';

