/**
 * Extended Packman API Methods
 * Additional endpoints for comprehensive floor data retrieval
 * 
 * These methods extend the base PackmanAPIService with specialized queries
 */

/**
 * Enhanced API methods (added to PackmanAPIService prototype or wrapper)
 */
const ExtendedPackmanMethods = {
  /**
   * Get real-time worker activity
   * @param {Object} options - Filter options
   * @returns {Promise<Object>}
   */
  async getWorkerActivity(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      limit: options.limit || 1000,
      startTime: options.startTime || new Date(Date.now() - 3600000).toISOString(),
      endTime: options.endTime || new Date().toISOString(),
      ...options
    });

    return this.makeRequest(`/activity?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get station utilization metrics
   * @param {Object} options - Time range and filters
   * @returns {Promise<Array>}
   */
  async getStationUtilization(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      startDate: options.startDate || new Date().toISOString().split('T')[0],
      timeGranularity: options.timeGranularity || '5m',
      ...options
    });

    return this.makeRequest(`/stations/utilization?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get process compliance and quality metrics
   * @param {string} processId - Process identifier
   * @param {Object} options - Time range
   * @returns {Promise<Object>}
   */
  async getProcessQuality(processId, options = {}) {
    if (!processId) throw new Error('Process ID required');

    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      startDate: options.startDate || new Date().toISOString().split('T')[0],
      endDate: options.endDate || new Date().toISOString().split('T')[0],
      ...options
    });

    return this.makeRequest(`/quality/${processId}?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get worker productivity rankings
   * @param {Object} options - Time range and filters
   * @returns {Promise<Array>}
   */
  async getProductivityRankings(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      startDate: options.startDate || new Date().toISOString().split('T')[0],
      endDate: options.endDate || new Date().toISOString().split('T')[0],
      limit: options.limit || 100,
      ...options
    });

    return this.makeRequest(`/rankings/productivity?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get safety incidents
   * @param {Object} options - Filters
   * @returns {Promise<Array>}
   */
  async getSafetyIncidents(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      startDate: options.startDate || new Date().toISOString().split('T')[0],
      severity: options.severity || 'all', // 'critical', 'high', 'medium', 'low', 'all'
      ...options
    });

    return this.makeRequest(`/safety/incidents?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get equipment status and maintenance alerts
   * @param {Object} options - Filters
   * @returns {Promise<Array>}
   */
  async getEquipmentStatus(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      status: options.status || 'all', // 'operational', 'maintenance', 'offline', 'all'
      ...options
    });

    return this.makeRequest(`/equipment/status?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get shift transition data
   * @param {Object} options - Filters
   * @returns {Promise<Array>}
   */
  async getShiftTransitions(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      date: options.date || new Date().toISOString().split('T')[0],
      ...options
    });

    return this.makeRequest(`/shifts/transitions?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get batch operation data
   * @param {Object} options - Filters
   * @returns {Promise<Array>}
   */
  async getBatchOperations(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      status: options.status || 'active', // 'active', 'completed', 'failed', 'all'
      limit: options.limit || 500,
      ...options
    });

    return this.makeRequest(`/batches?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get performance anomalies and alerts
   * @param {Object} options - Filters
   * @returns {Promise<Array>}
   */
  async getAnomalies(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      severity: options.severity || 'all', // 'critical', 'warning', 'info', 'all'
      limit: options.limit || 100,
      ...options
    });

    return this.makeRequest(`/anomalies?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get capacity forecast
   * @param {Object} options - Time horizon
   * @returns {Promise<Object>}
   */
  async getCapacityForecast(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      horizon: options.horizon || '24h', // '1h', '4h', '24h', '7d'
      ...options
    });

    return this.makeRequest(`/forecast/capacity?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Get historical comparison (day-over-day, week-over-week)
   * @param {Object} options - Comparison type and period
   * @returns {Promise<Object>}
   */
  async getHistoricalComparison(options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      comparisonType: options.comparisonType || 'day', // 'day', 'week', 'month'
      metric: options.metric || 'productivity', // 'productivity', 'quality', 'safety'
      ...options
    });

    return this.makeRequest(`/history/comparison?${params.toString()}`, {
      method: 'GET'
    });
  },

  /**
   * Bulk fetch multiple data types at once
   * @param {Array<string>} dataTypes - Types to fetch
   * @param {Object} options - Common options
   * @returns {Promise<Object>}
   */
  async getBulkData(dataTypes = [], options = {}) {
    const params = new URLSearchParams({
      facility: options.facilityCode || this.config.facilityCode,
      types: dataTypes.join(','),
      ...options
    });

    return this.makeRequest(`/bulk?${params.toString()}`, {
      method: 'GET'
    });
  }
};

/**
 * Add extended methods to PackmanAPIService
 */
function extendPackmanAPI(apiService) {
  if (!apiService) {
    console.error('❌ API Service not provided');
    return false;
  }

  // Add each method to the API service
  Object.assign(apiService, ExtendedPackmanMethods);
  
  console.log('✅ Extended API methods added');
  return true;
}

/**
 * Data transformer utilities for API responses
 */
const DataTransformers = {
  /**
   * Transform worker activity to MAD7 format
   */
  transformWorkerActivity(rawData) {
    if (!rawData || !rawData.workers) return [];
    
    return rawData.workers.map(w => ({
      login: w.login || w.id,
      processId: w.current_process,
      stationId: w.current_station,
      rate: w.current_rate || 0,
      quality: w.quality_score || 0,
      startTime: w.shift_start,
      breaks: w.breaks_count,
      lastActivity: w.last_activity_time
    }));
  },

  /**
   * Transform station utilization data
   */
  transformStationUtilization(rawData) {
    if (!rawData || !rawData.stations) return [];
    
    return rawData.stations.map(s => ({
      stationId: s.id,
      name: s.name,
      utilization: (s.occupied_slots / s.total_slots) * 100,
      activeWorkers: s.occupied_slots,
      capacity: s.total_slots,
      avgRate: s.average_rate,
      targetRate: s.target_rate,
      efficiency: (s.average_rate / s.target_rate) * 100
    }));
  },

  /**
   * Transform quality metrics
   */
  transformQualityMetrics(rawData) {
    if (!rawData) return {};
    
    return {
      defectRate: rawData.defect_rate || 0,
      reworkRate: rawData.rework_rate || 0,
      passRate: rawData.pass_rate || 100,
      topDefects: rawData.top_defects || [],
      trendDirection: rawData.trend_direction || 'stable'
    };
  },

  /**
   * Transform anomalies to alerts
   */
  transformAnomalies(rawData) {
    if (!rawData || !rawData.anomalies) return [];
    
    return rawData.anomalies.map(a => ({
      id: a.id,
      type: a.anomaly_type,
      severity: a.severity,
      station: a.station_id,
      message: a.description,
      timestamp: a.detected_at,
      recommended_action: a.recommended_action
    }));
  }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ExtendedPackmanMethods,
    extendPackmanAPI,
    DataTransformers
  };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.extendPackmanAPI = extendPackmanAPI;
  window.DataTransformers = DataTransformers;
  
  console.log('%c✅ Extended API methods module loaded', 'color: green; font-weight: bold;');
}
