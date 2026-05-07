/**
 * API Resilience Layer
 * Adds retry logic, circuit breaker, exponential backoff, and caching
 * 
 * This module wraps the Packman API service with enterprise-grade
 * resilience patterns to handle failures gracefully.
 */

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by detecting service degradation early
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5; // Failures before opening
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitorInterval = options.monitorInterval || 5000; // 5 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        console.log('⚡ Circuit breaker entering HALF_OPEN state - testing recovery...');
      } else {
        const waitMs = Math.ceil((this.nextAttemptTime - Date.now()) / 1000);
        throw new Error(`Circuit breaker OPEN. Service unavailable. Retry in ${waitMs}s`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      console.log('✅ Circuit breaker CLOSED - service recovered');
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeout;
      console.warn(`⚠️ Circuit breaker OPEN after ${this.failureCount} failures. Will retry at ${new Date(this.nextAttemptTime).toLocaleTimeString()}`);
    }
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime) : null
    };
  }
}

/**
 * Retry Strategy with Exponential Backoff
 * Intelligently retries failed requests with increasing delays
 */
class RetryStrategy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelayMs = options.initialDelayMs || 100;
    this.maxDelayMs = options.maxDelayMs || 30000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.retryableStatusCodes = options.retryableStatusCodes || [408, 429, 500, 502, 503, 504];
    this.retryableErrors = options.retryableErrors || ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
  }

  isRetryable(error, statusCode) {
    // Network errors are retryable
    if (error && this.retryableErrors.some(code => error.message.includes(code))) {
      return true;
    }
    
    // Specific HTTP status codes are retryable
    if (statusCode && this.retryableStatusCodes.includes(statusCode)) {
      return true;
    }
    
    return false;
  }

  calculateBackoff(attemptNumber) {
    const exponentialDelay = this.initialDelayMs * Math.pow(this.backoffMultiplier, attemptNumber);
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * exponentialDelay * 0.1;
    const delay = Math.min(exponentialDelay + jitter, this.maxDelayMs);
    return Math.round(delay);
  }

  async execute(fn, context = {}) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const statusCode = error.statusCode || error.response?.status;
        
        if (attempt === this.maxRetries || !this.isRetryable(error, statusCode)) {
          throw error;
        }
        
        const backoffMs = this.calculateBackoff(attempt);
        console.warn(
          `⚠️ Request failed (attempt ${attempt + 1}/${this.maxRetries + 1}). ` +
          `Retrying in ${backoffMs}ms...`,
          { error: error.message, statusCode }
        );
        
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
    
    throw lastError;
  }
}

/**
 * Request Cache with TTL
 * Caches successful API responses to reduce load
 */
class RequestCache {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 300000; // 5 minutes default
    this.maxSize = options.maxSize || 100; // Max cached entries
    this.cache = new Map();
  }

  generateKey(endpoint, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&');
    return `${endpoint}?${sortedParams}`;
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    console.debug(`✅ Cache HIT: ${key}`);
    return entry.data;
  }

  set(key, data) {
    // Implement simple LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.debug(`🗑️ Evicted old cache entry to stay under limit`);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    console.debug(`💾 Cache WRITE: ${key}`);
  }

  clear() {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries: Array.from(this.cache.entries()).map(([key, value]) => ({
        key,
        age: Date.now() - value.timestamp,
        ttl: this.ttlMs
      }))
    };
  }
}

/**
 * Resilient API Wrapper
 * Combines all resilience patterns for robust API calls
 */
class ResilientAPIWrapper {
  constructor(apiService, options = {}) {
    this.api = apiService;
    
    // Initialize resilience components
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.retryStrategy = new RetryStrategy(options.retry);
    this.cache = new RequestCache(options.cache);
    
    this.requestLog = [];
    this.maxLogSize = options.maxLogSize || 100;
  }

  /**
   * Make a resilient API call with all safety features
   */
  async call(method, endpoint, params = {}, options = {}) {
    const cacheKey = this.cache.generateKey(endpoint, params);
    const useCache = options.useCache !== false; // Default true
    
    // Try cache first
    if (useCache && method === 'GET') {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }
    
    // Execute with circuit breaker + retry
    try {
      const result = await this.circuitBreaker.execute(() =>
        this.retryStrategy.execute(() =>
          this.api[method](endpoint, params, options)
        )
      );
      
      // Cache successful response
      if (useCache && method === 'GET') {
        this.cache.set(cacheKey, result);
      }
      
      this.logRequest(method, endpoint, 'SUCCESS', null);
      return result;
      
    } catch (error) {
      this.logRequest(method, endpoint, 'ERROR', error.message);
      throw error;
    }
  }

  /**
   * Wrapper for getRecentFloorData with resilience
   */
  async getRecentFloorData(options = {}, callOptions = {}) {
    return this.call('getRecentFloorData', '/recent', options, callOptions);
  }

  /**
   * Wrapper for getWorkerProfile with resilience
   */
  async getWorkerProfile(login, callOptions = {}) {
    return this.call('getWorkerProfile', `/worker/${login}`, { login }, callOptions);
  }

  /**
   * Wrapper for getShiftSchedule with resilience
   */
  async getShiftSchedule(options = {}, callOptions = {}) {
    return this.call('getShiftSchedule', '/schedule', options, callOptions);
  }

  /**
   * Wrapper for getProcessMetrics with resilience
   */
  async getProcessMetrics(processId, options = {}, callOptions = {}) {
    return this.call('getProcessMetrics', `/metrics/${processId}`, { processId, ...options }, callOptions);
  }

  logRequest(method, endpoint, status, error) {
    const entry = {
      timestamp: new Date().toISOString(),
      method,
      endpoint,
      status,
      error
    };
    
    this.requestLog.push(entry);
    
    // Keep log size bounded
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog.shift();
    }
  }

  getStatus() {
    return {
      circuitBreaker: this.circuitBreaker.getStatus(),
      cache: this.cache.getStats(),
      recentRequests: this.requestLog.slice(-10)
    };
  }

  clearCache() {
    this.cache.clear();
  }

  resetCircuitBreaker() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failureCount = 0;
    console.log('🔄 Circuit breaker reset');
  }
}

/**
 * Initialize resilient wrapper for global packmanAPI
 */
function initializeResilientAPI(packmanAPI, options = {}) {
  if (!packmanAPI) {
    console.error('❌ packmanAPI not provided');
    return null;
  }

  const defaultOptions = {
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 60000
    },
    retry: {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 30000
    },
    cache: {
      ttlMs: 300000, // 5 minutes
      maxSize: 100
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };
  const resilientAPI = new ResilientAPIWrapper(packmanAPI, mergedOptions);
  
  console.log('✅ Resilient API wrapper initialized');
  return resilientAPI;
}

// Export for use in Node.js/module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CircuitBreaker,
    RetryStrategy,
    RequestCache,
    ResilientAPIWrapper,
    initializeResilientAPI
  };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.CircuitBreaker = CircuitBreaker;
  window.RetryStrategy = RetryStrategy;
  window.RequestCache = RequestCache;
  window.ResilientAPIWrapper = ResilientAPIWrapper;
  window.initializeResilientAPI = initializeResilientAPI;
  
  console.log('%c✅ API Resilience module loaded', 'color: green; font-weight: bold;');
}
