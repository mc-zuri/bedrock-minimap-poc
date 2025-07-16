import { EventEmitter } from 'events';

export class CircularBuffer {
  constructor(maxSize = 1000) {
    this.buffer = new Array(maxSize);
    this.maxSize = maxSize;
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
  
  push(item) {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.maxSize;
    
    if (this.size < this.maxSize) {
      this.size++;
    } else {
      this.head = (this.head + 1) % this.maxSize;
    }
  }
  
  toArray() {
    const result = [];
    let current = this.head;
    
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.maxSize;
    }
    
    return result;
  }
  
  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
  
  getLast(n) {
    const count = Math.min(n, this.size);
    const result = [];
    let current = (this.tail - count + this.maxSize) % this.maxSize;
    
    for (let i = 0; i < count; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.maxSize;
    }
    
    return result;
  }
}

export class LogAggregator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.bufferSize = options.bufferSize || 1000;
    this.logs = new Map();
    this.globalBuffer = new CircularBuffer(this.bufferSize * 3);
    this.filters = new Map();
    this.logLevels = ['debug', 'info', 'warn', 'error'];
  }
  
  addService(serviceName) {
    if (!this.logs.has(serviceName)) {
      this.logs.set(serviceName, new CircularBuffer(this.bufferSize));
    }
  }
  
  removeService(serviceName) {
    this.logs.delete(serviceName);
    this.filters.delete(serviceName);
  }
  
  attachProcess(serviceName, childProcess) {
    this.addService(serviceName);
    
    childProcess.stdout.on('data', (data) => {
      this.addLog(serviceName, 'info', data.toString());
    });
    
    childProcess.stderr.on('data', (data) => {
      this.addLog(serviceName, 'error', data.toString());
    });
  }
  
  addLog(serviceName, level, message) {
    const lines = message.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const logEntry = {
        service: serviceName,
        level,
        message: line,
        timestamp: new Date()
      };
      
      const serviceBuffer = this.logs.get(serviceName);
      if (serviceBuffer) {
        serviceBuffer.push(logEntry);
      }
      
      this.globalBuffer.push(logEntry);
      
      if (this.shouldEmit(serviceName, level)) {
        this.emit('log', logEntry);
      }
    }
  }
  
  shouldEmit(serviceName, level) {
    const filter = this.filters.get(serviceName);
    if (!filter) return true;
    
    const levelIndex = this.logLevels.indexOf(level);
    const filterIndex = this.logLevels.indexOf(filter.level);
    
    return levelIndex >= filterIndex;
  }
  
  setFilter(serviceName, filter) {
    this.filters.set(serviceName, filter);
  }
  
  clearFilter(serviceName) {
    this.filters.delete(serviceName);
  }
  
  getServiceLogs(serviceName, limit = 100) {
    const buffer = this.logs.get(serviceName);
    if (!buffer) return [];
    
    return buffer.getLast(limit);
  }
  
  getAllLogs(limit = 100) {
    return this.globalBuffer.getLast(limit);
  }
  
  searchLogs(query, options = {}) {
    const {
      service,
      level,
      startTime,
      endTime,
      limit = 100,
      regex = false
    } = options;
    
    const logs = service ? this.getServiceLogs(service, limit * 2) : this.getAllLogs(limit * 2);
    const results = [];
    
    const searchPattern = regex ? new RegExp(query, 'i') : null;
    
    for (const log of logs) {
      if (level && log.level !== level) continue;
      if (startTime && log.timestamp < startTime) continue;
      if (endTime && log.timestamp > endTime) continue;
      
      const matches = searchPattern
        ? searchPattern.test(log.message)
        : log.message.toLowerCase().includes(query.toLowerCase());
      
      if (matches) {
        results.push(log);
        if (results.length >= limit) break;
      }
    }
    
    return results;
  }
  
  clearServiceLogs(serviceName) {
    const buffer = this.logs.get(serviceName);
    if (buffer) {
      buffer.clear();
    }
  }
  
  clearAllLogs() {
    for (const buffer of this.logs.values()) {
      buffer.clear();
    }
    this.globalBuffer.clear();
  }
  
  getStats() {
    const stats = {
      services: {},
      total: {
        count: this.globalBuffer.size,
        levels: {}
      }
    };
    
    for (const level of this.logLevels) {
      stats.total.levels[level] = 0;
    }
    
    for (const [serviceName, buffer] of this.logs) {
      const serviceLogs = buffer.toArray();
      stats.services[serviceName] = {
        count: serviceLogs.length,
        levels: {}
      };
      
      for (const level of this.logLevels) {
        const count = serviceLogs.filter(log => log.level === level).length;
        stats.services[serviceName].levels[level] = count;
        stats.total.levels[level] += count;
      }
    }
    
    return stats;
  }
}

export const logAggregator = new LogAggregator();