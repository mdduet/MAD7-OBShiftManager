/**
 * UI Integration for Live API Data
 * Connects Packman API to MAD7's existing UI components
 * 
 * This module provides methods to:
 * - Update floor status displays with live data
 * - Populate worker performance metrics
 * - Show real-time anomalies and alerts
 * - Update shift management data
 */

/**
 * Floor UI Updater
 */
class FloorUIUpdater {
  constructor(options = {}) {
    this.floorDataContainer = options.floorDataContainer || '#page-floor';
    this.workerListSelector = options.workerListSelector || '.worker-list';
    this.stationGridSelector = options.stationGridSelector || '.station-grid';
    this.lastUpdateTime = null;
  }

  /**
   * Update floor overview with live data
   */
  updateFloorOverview(floorData) {
    if (!floorData || !floorData.stations) return;

    console.log('🖼️ Updating floor overview...');
    
    const container = document.querySelector(this.floorDataContainer);
    if (!container) {
      console.warn('⚠️ Floor container not found:', this.floorDataContainer);
      return;
    }

    // Calculate aggregate metrics
    const totalWorkers = floorData.stations.reduce((sum, s) => sum + (s.active_workers || 0), 0);
    const totalStations = floorData.stations.length;
    const avgRate = floorData.stations.length > 0
      ? Math.round(
          floorData.stations.reduce((sum, s) => sum + (s.current_rate || 0), 0) / floorData.stations.length
        )
      : 0;

    // Update badges/indicators
    const workerBadge = container.querySelector('[data-metric="active-workers"]');
    if (workerBadge) {
      workerBadge.textContent = totalWorkers;
      workerBadge.className = 'badge ' + (totalWorkers > 10 ? 'badge-success' : totalWorkers > 5 ? 'badge-warning' : 'badge-error');
    }

    const stationBadge = container.querySelector('[data-metric="active-stations"]');
    if (stationBadge) {
      stationBadge.textContent = totalStations;
    }

    const rateBadge = container.querySelector('[data-metric="avg-rate"]');
    if (rateBadge) {
      rateBadge.textContent = `${avgRate}/min`;
    }

    this.lastUpdateTime = new Date();
    this.updateTimestamp(container);
  }

  /**
   * Update worker table with live data
   */
  updateWorkerTable(floorData) {
    if (!floorData || !floorData.stations) return;

    console.log('📋 Updating worker table...');
    
    // Flatten all workers across stations
    const workers = [];
    floorData.stations.forEach(station => {
      if (station.active_workers > 0) {
        // Mock worker data (in real scenario, would come from separate endpoint)
        for (let i = 0; i < station.active_workers; i++) {
          workers.push({
            login: `worker_${station.id}_${i}`,
            station: station.name,
            process: station.name.includes('Pick') ? 'Pick' : 'Pack',
            rate: station.current_rate || 0,
            target: station.target_rate || 0,
            efficiency: Math.round((station.current_rate / station.target_rate) * 100) || 0,
            status: 'active'
          });
        }
      }
    });

    // Build and inject table HTML
    const tableHtml = this.buildWorkerTableHtml(workers);
    const workerContainer = document.querySelector(this.workerListSelector);
    
    if (workerContainer) {
      workerContainer.innerHTML = tableHtml;
      this.attachWorkerRowListeners();
    }
  }

  /**
   * Build HTML for worker table rows
   */
  buildWorkerTableHtml(workers) {
    if (!workers || workers.length === 0) {
      return '<tr><td colspan="6" class="text-center text-muted">No active workers</td></tr>';
    }

    return workers.map(w => `
      <tr data-login="${w.login}" class="worker-row">
        <td class="mono">${w.login}</td>
        <td>${w.station}</td>
        <td>${w.process}</td>
        <td class="text-right">${w.rate}</td>
        <td class="text-right">${w.target}</td>
        <td>
          <div class="progress-bar small" style="width: ${w.efficiency}%">
            <span class="progress-label">${w.efficiency}%</span>
          </div>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Update station grid/heatmap
   */
  updateStationGrid(floorData) {
    if (!floorData || !floorData.stations) return;

    console.log('🎨 Updating station grid...');
    
    const stationGrid = document.querySelector(this.stationGridSelector);
    if (!stationGrid) return;

    // Update each station tile
    floorData.stations.forEach(station => {
      const stationTile = stationGrid.querySelector(`[data-station="${station.id}"]`);
      
      if (stationTile) {
        const utilization = station.active_workers / station.capacity;
        const efficiency = station.current_rate / station.target_rate;
        
        // Update color based on utilization
        let status = 'idle';
        if (utilization >= 0.8) status = 'high';
        else if (utilization >= 0.5) status = 'medium';
        else if (utilization > 0) status = 'active';
        
        stationTile.className = `station-tile status-${status}`;
        
        // Update inner content
        const rateElement = stationTile.querySelector('.station-rate');
        if (rateElement) {
          rateElement.textContent = `${station.current_rate || 0}`;
          rateElement.style.color = efficiency >= 1 ? '#3ecf8e' : efficiency >= 0.9 ? '#f59e0b' : '#f43f5e';
        }
        
        const workerCountElement = stationTile.querySelector('.worker-count');
        if (workerCountElement) {
          workerCountElement.textContent = `${station.active_workers}/${station.capacity}`;
        }
      }
    });
  }

  /**
   * Attach click listeners to worker rows
   */
  attachWorkerRowListeners() {
    document.querySelectorAll('.worker-row').forEach(row => {
      row.addEventListener('click', () => {
        const login = row.getAttribute('data-login');
        if (typeof showWorkerDetail === 'function') {
          showWorkerDetail(login);
        }
      });
    });
  }

  /**
   * Update last refresh timestamp
   */
  updateTimestamp(container) {
    let timestampEl = container.querySelector('[data-element="last-update"]');
    
    if (!timestampEl) {
      timestampEl = document.createElement('small');
      timestampEl.setAttribute('data-element', 'last-update');
      timestampEl.style.cssText = 'position: absolute; top: 10px; right: 10px; color: var(--text3);';
      container.appendChild(timestampEl);
    }
    
    timestampEl.textContent = `Updated: ${this.lastUpdateTime.toLocaleTimeString()}`;
  }
}

/**
 * Alerts & Anomalies UI Updater
 */
class AlertsUIUpdater {
  constructor(options = {}) {
    this.alertsContainer = options.alertsContainer || '#page-alerts';
    this.alertBadgeSelector = options.alertBadgeSelector || '[data-alert-count]';
    this.maxVisibleAlerts = options.maxVisibleAlerts || 20;
  }

  /**
   * Update alerts display with anomalies
   */
  updateAnomalies(anomalies) {
    if (!anomalies) return;

    console.log('🚨 Updating anomalies display...');
    
    // Update badge count
    this.updateAlertBadge(anomalies.length);
    
    // Build alerts list
    const alertsHtml = this.buildAnomaliesHtml(anomalies);
    
    const alertsContainer = document.querySelector(this.alertsContainer);
    if (alertsContainer) {
      const alertsList = alertsContainer.querySelector('.alerts-list') || alertsContainer;
      alertsList.innerHTML = alertsHtml;
      this.attachAlertListeners();
    }
  }

  /**
   * Update alert badge count
   */
  updateAlertBadge(count) {
    const badges = document.querySelectorAll(this.alertBadgeSelector);
    badges.forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    });

    // Also update nav tab alert indicator
    const alertsTab = document.querySelector('[data-tab="alerts"]');
    if (alertsTab) {
      const alertDot = alertsTab.querySelector('.alert-dot');
      if (alertDot) {
        alertDot.classList.toggle('on', count > 0);
      }
    }
  }

  /**
   * Build HTML for anomalies list
   */
  buildAnomaliesHtml(anomalies) {
    if (!anomalies || anomalies.length === 0) {
      return '<div class="text-center text-muted">✓ No anomalies detected</div>';
    }

    return anomalies.slice(0, this.maxVisibleAlerts).map(a => `
      <div class="alert-item alert-${a.severity || 'info'}" data-anomaly-id="${a.id}">
        <div class="alert-header">
          <strong>${a.type || 'Alert'}</strong>
          <span class="severity-badge">${a.severity || 'info'}</span>
        </div>
        <div class="alert-body">
          <p>${a.message || a.description || 'No details'}</p>
          ${a.station ? `<small>Station: ${a.station}</small>` : ''}
        </div>
        ${a.recommended_action ? `
          <div class="alert-action">
            <small>✓ ${a.recommended_action}</small>
          </div>
        ` : ''}
        <div class="alert-time">
          <small>${new Date(a.timestamp).toLocaleTimeString()}</small>
        </div>
      </div>
    `).join('');
  }

  /**
   * Attach click listeners to alerts
   */
  attachAlertListeners() {
    document.querySelectorAll('.alert-item').forEach(item => {
      item.addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    });
  }
}

/**
 * Dashboard Metrics Updater
 */
class MetricsUIUpdater {
  constructor(options = {}) {
    this.dashboardContainer = options.dashboardContainer || '.dashboard';
    this.metricsRefreshRate = options.metricsRefreshRate || 10000; // 10 seconds
  }

  /**
   * Update performance metrics display
   */
  updateMetrics(data) {
    console.log('📊 Updating metrics...');
    
    if (data.floorData) {
      this.updateFloorMetrics(data.floorData);
    }
    
    if (data.quality) {
      this.updateQualityMetrics(data.quality);
    }
    
    if (data.anomalies) {
      this.updateAnomalyMetrics(data.anomalies);
    }
  }

  /**
   * Update floor-specific metrics
   */
  updateFloorMetrics(floorData) {
    const stations = floorData.stations || [];
    
    // Utilization
    const utilization = stations.reduce((sum, s) => sum + (s.active_workers / s.capacity), 0) / stations.length;
    this.updateMetricElement('utilization', `${Math.round(utilization * 100)}%`);
    
    // Productivity
    const productivity = stations.reduce((sum, s) => sum + (s.current_rate / s.target_rate), 0) / stations.length;
    this.updateMetricElement('productivity', `${Math.round(productivity * 100)}%`);
    
    // Active stations
    const activeStations = stations.filter(s => s.active_workers > 0).length;
    this.updateMetricElement('active-stations', `${activeStations}/${stations.length}`);
  }

  /**
   * Update quality metrics
   */
  updateQualityMetrics(qualityData) {
    this.updateMetricElement('defect-rate', `${qualityData.defectRate || 0}%`);
    this.updateMetricElement('pass-rate', `${qualityData.passRate || 100}%`);
    this.updateMetricElement('rework-rate', `${qualityData.reworkRate || 0}%`);
  }

  /**
   * Update anomaly metrics
   */
  updateAnomalyMetrics(anomalies) {
    const critical = anomalies.filter(a => a.severity === 'critical').length;
    const warnings = anomalies.filter(a => a.severity === 'warning').length;
    
    this.updateMetricElement('critical-count', critical, 'badge-danger');
    this.updateMetricElement('warning-count', warnings, 'badge-warning');
  }

  /**
   * Update a single metric element
   */
  updateMetricElement(metricId, value, className = '') {
    const elements = document.querySelectorAll(`[data-metric="${metricId}"]`);
    elements.forEach(el => {
      el.textContent = value;
      if (className) {
        el.className = className;
      }
    });
  }
}

/**
 * Unified UI Manager
 * Coordinates all UI updates
 */
class UIManager {
  constructor(options = {}) {
    this.floorUpdater = new FloorUIUpdater(options.floor || {});
    this.alertsUpdater = new AlertsUIUpdater(options.alerts || {});
    this.metricsUpdater = new MetricsUIUpdater(options.metrics || {});
    
    this.isEnabled = true;
  }

  /**
   * Handle floor data update from API
   */
  handleFloorDataUpdate(floorData) {
    if (!this.isEnabled) return;
    
    try {
      this.floorUpdater.updateFloorOverview(floorData);
      this.floorUpdater.updateWorkerTable(floorData);
      this.floorUpdater.updateStationGrid(floorData);
      this.metricsUpdater.updateFloorMetrics(floorData);
      
      // Trigger custom event for other components
      window.dispatchEvent(new CustomEvent('floorDataUpdated', { detail: floorData }));
    } catch (error) {
      console.error('Error updating floor UI:', error);
    }
  }

  /**
   * Handle anomaly/alert update from API
   */
  handleAnomaliesUpdate(anomalies) {
    if (!this.isEnabled) return;
    
    try {
      this.alertsUpdater.updateAnomalies(anomalies);
      this.metricsUpdater.updateAnomalyMetrics(anomalies);
      
      window.dispatchEvent(new CustomEvent('anomaliesUpdated', { detail: anomalies }));
    } catch (error) {
      console.error('Error updating anomalies UI:', error);
    }
  }

  /**
   * Enable/disable updates
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FloorUIUpdater,
    AlertsUIUpdater,
    MetricsUIUpdater,
    UIManager
  };
}

// Make available globally
if (typeof window !== 'undefined') {
  window.FloorUIUpdater = FloorUIUpdater;
  window.AlertsUIUpdater = AlertsUIUpdater;
  window.MetricsUIUpdater = MetricsUIUpdater;
  window.UIManager = UIManager;
  
  console.log('%c✅ UI integration module loaded', 'color: green; font-weight: bold;');
}
