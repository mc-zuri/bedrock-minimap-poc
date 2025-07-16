import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { isProcessRunning } from './process-utils.js';

/**
 * PID Tracker for persistent process tracking across app restarts
 */
export class PidTracker {
  constructor() {
    this.filePath = join(app.getPath('userData'), 'pid-tracker.json');
    this.lockFilePath = this.filePath + '.lock';
    this.data = this.load();
  }

  /**
   * Load PID data from file
   * @private
   * @returns {object} PID tracking data
   */
  load() {
    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(content);
        
        // Validate structure
        if (!data.version || !data.processes || typeof data.lastUpdate !== 'number') {
          throw new Error('Invalid PID file structure');
        }
        
        return data;
      }
    } catch (error) {
      console.error('Failed to load PID tracker file:', error);
    }
    
    // Return default structure
    return {
      version: '1.0.0',
      processes: {},
      lastUpdate: Date.now()
    };
  }

  /**
   * Save PID data to file
   * @private
   */
  save() {
    try {
      // Simple file locking mechanism
      if (existsSync(this.lockFilePath)) {
        // Check if lock is stale (older than 5 seconds)
        const lockContent = readFileSync(this.lockFilePath, 'utf8');
        const lockTime = parseInt(lockContent, 10);
        if (Date.now() - lockTime > 5000) {
          // Stale lock, remove it
          unlinkSync(this.lockFilePath);
        } else {
          // Lock is fresh, skip save
          console.warn('PID tracker file is locked, skipping save');
          return;
        }
      }
      
      // Create lock
      writeFileSync(this.lockFilePath, Date.now().toString(), 'utf8');
      
      // Update timestamp
      this.data.lastUpdate = Date.now();
      
      // Write data
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
      
      // Remove lock
      if (existsSync(this.lockFilePath)) {
        unlinkSync(this.lockFilePath);
      }
    } catch (error) {
      console.error('Failed to save PID tracker file:', error);
      
      // Clean up lock file on error
      try {
        if (existsSync(this.lockFilePath)) {
          unlinkSync(this.lockFilePath);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Save a PID for tracking
   * @param {string} serviceName - Name of the service
   * @param {number} pid - Process ID
   * @param {object} details - Additional process details
   */
  savePid(serviceName, pid, details = {}) {
    if (!serviceName || !pid) return;
    
    this.data.processes[serviceName] = {
      pid,
      startTime: Date.now(),
      command: details.command || '',
      args: details.args || [],
      ...details
    };
    
    this.save();
  }

  /**
   * Remove a PID from tracking
   * @param {string} serviceName - Name of the service
   */
  removePid(serviceName) {
    if (!serviceName) return;
    
    delete this.data.processes[serviceName];
    this.save();
  }

  /**
   * Get all tracked PIDs
   * @returns {object} All tracked processes
   */
  loadPids() {
    return { ...this.data.processes };
  }

  /**
   * Get orphaned PIDs (processes from previous run that are still running)
   * @returns {Promise<object>} Orphaned processes
   */
  async getOrphanedPids() {
    const orphaned = {};
    const currentTime = Date.now();
    
    for (const [serviceName, info] of Object.entries(this.data.processes)) {
      // Consider a process orphaned if:
      // 1. The PID file is older than the current app session
      // 2. The process is still running
      const isOldProcess = info.startTime < (currentTime - 60000); // Older than 1 minute
      
      if (isOldProcess && isProcessRunning(info.pid)) {
        orphaned[serviceName] = info;
      }
    }
    
    return orphaned;
  }

  /**
   * Clear all tracked PIDs
   */
  clear() {
    this.data.processes = {};
    this.save();
  }

  /**
   * Clean up stale entries (processes that are no longer running)
   */
  async cleanup() {
    let cleaned = false;
    
    for (const [serviceName, info] of Object.entries(this.data.processes)) {
      if (!isProcessRunning(info.pid)) {
        delete this.data.processes[serviceName];
        cleaned = true;
      }
    }
    
    if (cleaned) {
      this.save();
    }
  }

  /**
   * Get PID info for a specific service
   * @param {string} serviceName - Name of the service
   * @returns {object|null} Process info or null
   */
  getPid(serviceName) {
    return this.data.processes[serviceName] || null;
  }

  /**
   * Check if a service has a tracked PID
   * @param {string} serviceName - Name of the service
   * @returns {boolean} True if service has a tracked PID
   */
  hasPid(serviceName) {
    return !!this.data.processes[serviceName];
  }

  /**
   * Update PID info for a service
   * @param {string} serviceName - Name of the service
   * @param {object} updates - Updates to apply
   */
  updatePid(serviceName, updates) {
    if (!this.data.processes[serviceName]) return;
    
    this.data.processes[serviceName] = {
      ...this.data.processes[serviceName],
      ...updates
    };
    
    this.save();
  }

  /**
   * Get all service names with tracked PIDs
   * @returns {string[]} Array of service names
   */
  getServiceNames() {
    return Object.keys(this.data.processes);
  }
}