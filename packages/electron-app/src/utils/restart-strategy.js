export class RestartStrategy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 5;
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.resetAfter = options.resetAfter || 300000; // 5 minutes
  }
  
  calculateDelay(retryCount) {
    if (retryCount >= this.maxRetries) {
      return null;
    }
    
    const delay = Math.min(
      this.initialDelay * Math.pow(this.factor, retryCount),
      this.maxDelay
    );
    
    return delay + Math.random() * 1000;
  }
  
  shouldRestart(retryCount, lastRestartTime) {
    if (retryCount >= this.maxRetries) {
      return false;
    }
    
    if (lastRestartTime && Date.now() - lastRestartTime > this.resetAfter) {
      return { shouldRestart: true, resetCount: true };
    }
    
    return { shouldRestart: true, resetCount: false };
  }
}

export const defaultRestartStrategy = new RestartStrategy({
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2
});

export const aggressiveRestartStrategy = new RestartStrategy({
  maxRetries: 10,
  initialDelay: 500,
  maxDelay: 10000,
  factor: 1.5
});

export const conservativeRestartStrategy = new RestartStrategy({
  maxRetries: 3,
  initialDelay: 5000,
  maxDelay: 60000,
  factor: 3
});