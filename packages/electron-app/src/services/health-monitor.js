import { EventEmitter } from 'events';
import { net } from 'electron';

export class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.checks = new Map();
    this.defaultInterval = options.defaultInterval || 30000;
    this.defaultTimeout = options.defaultTimeout || 5000;
    this.defaultRetries = options.defaultRetries || 3;
  }
  
  addService(serviceName, config) {
    if (this.checks.has(serviceName)) {
      this.removeService(serviceName);
    }
    
    const checkConfig = {
      ...config.healthCheck,
      interval: config.healthCheck?.interval || this.defaultInterval,
      timeout: config.healthCheck?.timeout || this.defaultTimeout,
      retries: config.healthCheck?.retries || this.defaultRetries
    };
    
    const checkState = {
      serviceName,
      config: checkConfig,
      timer: null,
      isChecking: false,
      lastCheck: null,
      consecutiveFailures: 0,
      status: 'unknown'
    };
    
    this.checks.set(serviceName, checkState);
    this.startHealthCheck(serviceName);
  }
  
  removeService(serviceName) {
    const checkState = this.checks.get(serviceName);
    if (checkState) {
      if (checkState.timer) {
        clearInterval(checkState.timer);
      }
      this.checks.delete(serviceName);
    }
  }
  
  startHealthCheck(serviceName) {
    const checkState = this.checks.get(serviceName);
    if (!checkState) return;
    
    const performCheck = async () => {
      if (checkState.isChecking) return;
      
      checkState.isChecking = true;
      
      try {
        const result = await this.checkServiceHealth(
          serviceName,
          checkState.config
        );
        
        checkState.lastCheck = new Date();
        checkState.status = result.healthy ? 'healthy' : 'unhealthy';
        
        if (result.healthy) {
          checkState.consecutiveFailures = 0;
        } else {
          checkState.consecutiveFailures++;
        }
        
        this.emit('health-check', {
          service: serviceName,
          status: checkState.status,
          consecutiveFailures: checkState.consecutiveFailures,
          lastCheck: checkState.lastCheck,
          details: result.details
        });
        
      } catch (error) {
        checkState.consecutiveFailures++;
        checkState.status = 'unhealthy';
        checkState.lastCheck = new Date();
        
        this.emit('health-check', {
          service: serviceName,
          status: 'unhealthy',
          consecutiveFailures: checkState.consecutiveFailures,
          lastCheck: checkState.lastCheck,
          error: error.message
        });
      } finally {
        checkState.isChecking = false;
      }
    };
    
    performCheck();
    
    checkState.timer = setInterval(performCheck, checkState.config.interval);
  }
  
  async checkServiceHealth(serviceName, config) {
    if (!config.url) {
      return { healthy: true, details: 'No health check URL configured' };
    }
    
    const startTime = Date.now();
    
    try {
      const request = net.request({
        url: config.url,
        method: 'GET',
        timeout: config.timeout
      });
      
      return new Promise((resolve, reject) => {
        let responseData = '';
        
        request.on('response', (response) => {
          const statusCode = response.statusCode;
          
          response.on('data', (chunk) => {
            responseData += chunk.toString();
          });
          
          response.on('end', () => {
            const responseTime = Date.now() - startTime;
            
            if (statusCode >= 200 && statusCode < 300) {
              resolve({
                healthy: true,
                details: {
                  statusCode,
                  responseTime,
                  body: responseData.slice(0, 1000)
                }
              });
            } else {
              resolve({
                healthy: false,
                details: {
                  statusCode,
                  responseTime,
                  body: responseData.slice(0, 1000),
                  reason: `Unexpected status code: ${statusCode}`
                }
              });
            }
          });
        });
        
        request.on('error', (error) => {
          reject(error);
        });
        
        request.on('timeout', () => {
          request.abort();
          reject(new Error('Health check timeout'));
        });
        
        request.end();
      });
      
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error.message,
          responseTime: Date.now() - startTime
        }
      };
    }
  }
  
  async performHealthCheck(serviceName) {
    const checkState = this.checks.get(serviceName);
    if (!checkState) {
      throw new Error(`No health check configured for service: ${serviceName}`);
    }
    
    return await this.checkServiceHealth(serviceName, checkState.config);
  }
  
  getServiceHealth(serviceName) {
    const checkState = this.checks.get(serviceName);
    if (!checkState) return null;
    
    return {
      status: checkState.status,
      lastCheck: checkState.lastCheck,
      consecutiveFailures: checkState.consecutiveFailures
    };
  }
  
  getAllServiceHealth() {
    const health = {};
    for (const [serviceName, checkState] of this.checks) {
      health[serviceName] = {
        status: checkState.status,
        lastCheck: checkState.lastCheck,
        consecutiveFailures: checkState.consecutiveFailures
      };
    }
    return health;
  }
  
  stopAllChecks() {
    for (const checkState of this.checks.values()) {
      if (checkState.timer) {
        clearInterval(checkState.timer);
      }
    }
    this.checks.clear();
  }
}

export const healthMonitor = new HealthMonitor();