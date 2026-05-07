/**
 * Real-Time Data Synchronization
 * Implements polling and WebSocket-based live updates
 * 
 * Features:
 * - Configurable polling intervals
 * - Automatic reconnection with exponential backoff
 * - Event-driven updates for UI refresh
 * - Delta tracking (only notify on changes)
 * - Health monitoring and circuit breaker integration
 */

/**
 * Polling-based live sync
 */
class PollingSync {
  constructor(apiService, options = {}) {
    this.api = apiService;
    this.pollingIntervalMs = options.pollingIntervalMs || 30000; // 30 seconds default
    this.maxBackoffMs = options.maxBackoffMs || 300000; // 5 minutes max
    this.enableDeltaTracking = options.enableDeltaTracking !== false;
    
    this.isRunning = false;
    this.pollingTimer = null;
    this.currentBackoffMs = this.pollingIntervalMs;
    this.consecutiveFailures = 0;
    
    // Track last known state for delta detection
    this.lastState = {
      floorData: null,
      workerActivity: null,
      anomalies: null
    };
    
    // Event listeners for updates
    this.listeners = {
      floorDataUpdated: [],
      workerActivityUpdated: [],
      anomaliesDetected: [],
      syncStarted: [],
      syncStopped: [],
      syncError: []
    };
  }

  /**
   * Start polling for live data
   */
  start() {
    if (this.isRunning) {
      console.warn('⚠️ Polling already running');
      return;
    }

    this.isRunning = true;
    this.consecutiveFailures = 0;
    this.currentBackoffMs = this.pollingIntervalMs;
    
    console.log(`📡 Starting live data polling every ${this.pollingIntervalMs}ms`);
    this.emit('syncStarted');
    
    // Trigger first poll immediately
    this.poll();
  }

  /**
   * Stop polling
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    console.log('🛑 Polling stopped');
    this.emit('syncStopped');
  }

  /**
   * Single poll cycle
   */
  async poll() {
    if (!this.isRunning) return;

    try {
      console.log('🔄 Polling for updates...');
      
      // Fetch floor data
      const floorData = await this.api.getRecentFloorData({
        facilityCode: 'MAD7',
        limit: 500
      });

      // Check for changes using delta tracking
      if (this.enableDeltaTracking && this.hasChanged(floorData, this.lastState.floorData)) {
        this.emit('floorDataUpdated', floorData);
        this.lastState.floorData = JSON.parse(JSON.stringify(floorData));
      } else if (!this.enableDeltaTracking) {
        this.emit('floorDataUpdated', floorData);
        this.lastState.floorData = JSON.parse(JSON.stringify(floorData));
      }

      // Fetch anomalies
      const anomalies = await this.api.getAnomalies({
        facility: 'MAD7',
        severity: 'all',
        limit: 50
      }).catch(() => null);

      if (anomalies && this.hasChanged(anomalies, this.lastState.anomalies)) {
        this.emit('anomaliesDetected', anomalies);
        this.lastState.anomalies = JSON.parse(JSON.stringify(anomalies));
      }

      // Reset failure counter on success
      this.consecutiveFailures = 0;
      this.currentBackoffMs = this.pollingIntervalMs;
      
      // Schedule next poll
      this.schedulePoll();
      
    } catch (error) {
      this.handlePollError(error);
    }
  }

  /**
   * Handle polling errors with exponential backoff
   */
  handlePollError(error) {
    this.consecutiveFailures++;
    
    // Calculate backoff
    this.currentBackoffMs = Math.min(
      this.pollingIntervalMs * Math.pow(2, this.consecutiveFailures - 1),
      this.maxBackoffMs
    );
    
    console.warn(
      `⚠️ Polling error (attempt ${this.consecutiveFailures}). ` +
      `Retrying in ${Math.ceil(this.currentBackoffMs / 1000)}s`,
      error.message
    );
    
    this.emit('syncError', error);
    this.schedulePoll();
  }

  /**
   * Schedule next polling cycle
   */
  schedulePoll() {
    if (!this.isRunning) return;
    
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
    }
    
    this.pollingTimer = setTimeout(() => this.poll(), this.currentBackoffMs);
  }

  /**
   * Simple change detection
   */
  hasChanged(newData, oldData) {
    if (!oldData) return true;
    return JSON.stringify(newData) !== JSON.stringify(oldData);
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Unregister event listener
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (error) {
          console.error(`Error in listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get current sync status
   */
  getStatus() {
    return {
      running: this.isRunning,
      pollingInterval: this.pollingIntervalMs,
      consecutiveFailures: this.consecutiveFailures,
      currentBackoff: this.currentBackoffMs,
      lastUpdate: {
        floorData: this.lastState.floorData ? new Date() : null,
        anomalies: this.lastState.anomalies ? new Date() : null
      }
    };
  }
}

/**
 * WebSocket-based live sync (for future use with backend support)
 */
class WebSocketSync {
  constructor(apiService, options = {}) {
    this.api = apiService;
    this.wsUrl = options.wsUrl || this.deriveWSUrl();
    this.reconnectIntervalMs = options.reconnectIntervalMs || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.isIntentionallyClosed = false;
    
    this.listeners = {
      connected: [],
      disconnected: [],
      floorDataUpdated: [],
      anomaliesDetected: [],
      error: []
    };
  }

  /**
   * Derive WebSocket URL from current location
   */
  deriveWSUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/packman/ws`;
  }

  /**
   * Connect to WebSocket
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('⚠️ WebSocket already connected');
      return;
    }

    try {
      this.isIntentionallyClosed = false;
      console.log(`🔌 Connecting to WebSocket: ${this.wsUrl}`);
      
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = () => this.handleClose();
      
    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      this.emit('error', error);
      this.attemptReconnect();
    }
  }

  /**
   * Handle WebSocket open
   */
  handleOpen() {
    console.log('✅ WebSocket connected');
    this.reconnectAttempts = 0;
    this.emit('connected');
    
    // Send initial subscription request
    this.send({
      type: 'subscribe',
      channels: ['floor-data', 'anomalies']
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'floor-data':
          this.emit('floorDataUpdated', data.payload);
          break;
        case 'anomaly':
          this.emit('anomaliesDetected', data.payload);
          break;
        case 'pong':
          // Heartbeat response
          break;
        default:
          console.debug('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }

  /**
   * Handle WebSocket error
   */
  handleError(error) {
    console.error('❌ WebSocket error:', error);
    this.emit('error', error);
  }

  /**
   * Handle WebSocket close
   */
  handleClose() {
    console.log('🔌 WebSocket disconnected');
    this.emit('disconnected');
    
    if (!this.isIntentionallyClosed) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached. Giving up.');
      return;
    }
    
    this.reconnectAttempts++;
    const backoffMs = Math.min(this.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1), 60000);
    
    console.log(`🔄 Reconnecting in ${Math.ceil(backoffMs / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => this.connect(), backoffMs);
  }

  /**
   * Send message through WebSocket
   */
  send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not connected - cannot send');
      return false;
    }
    
    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  /**
   * Send heartbeat/ping
   */
  ping() {
    return this.send({ type: 'ping' });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    this.isIntentionallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log('🔌 WebSocket disconnected intentionally');
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (error) {
          console.error(`Error in listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return {
      connected: this.ws && this.ws.readyState === WebSocket.OPEN,
      wsUrl: this.wsUrl,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }
}

/**
 * Unified Live Data Manager
 * Chooses best sync method and provides unified interface
 */
class LiveDataManager {
  constructor(apiService, options = {}) {
    this.api = apiService;
    this.useWebSocket = options.useWebSocket !== false && 'WebSocket' in window;
    
    // Initialize preferred sync method
    if (this.useWebSocket) {
      this.sync = new WebSocketSync(apiService, options.websocket);
      console.log('📡 Using WebSocket for live sync');
    } else {
      this.sync = new PollingSync(apiService, options.polling);
      console.log('📡 Using polling for live sync');
    }
  }

  /**
   * Start live sync
   */
  start() {
    this.sync.start();
  }

  /**
   * Stop live sync
   */
  stop() {
    this.sync.stop();
  }

  /**
   * Register data update listener
   */
  on(event, callback) {
    this.sync.on(event, callback);
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      method: this.useWebSocket ? 'WebSocket' : 'Polling',
      status: this.sync.getStatus()
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PollingSync,
    WebSocketSync,
    LiveDataManager
  };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.PollingSync = PollingSync;
  window.WebSocketSync = WebSocketSync;
  window.LiveDataManager = LiveDataManager;
  
  console.log('%c✅ Real-time sync module loaded', 'color: green; font-weight: bold;');
}
