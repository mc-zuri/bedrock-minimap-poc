import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';
import { checkPort } from '../utils/port-checker.js';
import { defaultRestartStrategy } from '../utils/restart-strategy.js';
import { getServiceConfig, getServiceStartupOrder, getServiceShutdownOrder } from './service-config.js';
import { logAggregator } from './log-aggregator.js';
import { healthMonitor } from './health-monitor.js';
import { isProcessRunning, getProcessTree, killProcessTree, gracefulKill } from '../utils/process-utils.js';
import { PidTracker } from '../utils/pid-tracker.js';

export class ProcessManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.processes = new Map();
    this.restartStrategy = options.restartStrategy || defaultRestartStrategy;
    this.autoRestart = options.autoRestart !== false;
    this.shutdownTimeout = options.shutdownTimeout || 5000;
    this.gracefulShutdownTimeout = options.gracefulShutdownTimeout || 5000;
    this.startupDelay = options.startupDelay || 1000;
    this.isShuttingDown = false;
    this.pidTracker = new PidTracker();
    
    this.setupShutdownHandlers();
    this.cleanupOrphanedProcesses();
  }
  
  async startService(serviceName, {env} = {}) {
    if (this.processes.get(serviceName)?.status === 'running') {
      console.log(`Service ${serviceName} is already running`);
      return this.processes.get(serviceName);
    }
    
    const config = getServiceConfig(serviceName);
    if (!config) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    
    const portAvailable = await checkPort(config.port);
    if (!portAvailable) {
      const error = new Error(`Port ${config.port} is already in use for service ${serviceName}`);
      this.emit('error', { service: serviceName, error });
      throw error;
    }
    
    const state = {
      service: config,
      process: null,
      status: 'starting',
      pid: null,
      startTime: null,
      restartCount: 0,
      lastRestartTime: null,
      lastError: null,
      childPids: [],
      health: {
        status: 'unknown',
        lastCheck: null,
        consecutiveFailures: 0
      }
    };
    
    this.processes.set(serviceName, state);
    this.emit('status-change', { service: serviceName, status: 'starting' });
    
    try {
      const spawnOptions = {
        cwd: config.cwd,
        env: env ?? config.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: config.command.includes('npm'),
        windowsHide: true,
        // Create process group on Unix for better cleanup
        detached: process.platform !== 'win32'
      };
      
      let child;
      try {
        child = spawn(config.command, config.args, spawnOptions);
      } catch (spawnError) {
        // Handle spawn errors (ENOENT, EACCES, etc.)
        console.error(`Failed to spawn ${serviceName}:`, spawnError);
        
        if (spawnError.code === 'ENOENT') {
          throw new Error(`Command not found: ${config.command}`);
        } else if (spawnError.code === 'EACCES') {
          throw new Error(`Permission denied: ${config.command}`);
        } else {
          throw spawnError;
        }
      }
      
      // Verify child process was created successfully
      if (!child || !child.pid) {
        throw new Error(`Failed to create process for ${serviceName}`);
      }
      
      state.process = child;
      state.pid = child.pid;
      state.startTime = new Date();
      
      // Save PID for crash recovery
      this.pidTracker.savePid(serviceName, child.pid, {
        command: config.command,
        args: config.args,
        startTime: Date.now()
      });
      
      // Track child processes
      this.trackChildProcesses(serviceName, child.pid);
      
      logAggregator.attachProcess(serviceName, child);
      
      child.on('error', (error) => {
        console.error(`Process error for ${serviceName}:`, error);
        state.lastError = error;
        
        // Handle specific error types
        if (error.code === 'ENOENT') {
          state.lastError = new Error(`Command not found: ${config.command}`);
        } else if (error.code === 'EACCES') {
          state.lastError = new Error(`Permission denied: ${config.command}`);
        } else if (error.code === 'EMFILE') {
          state.lastError = new Error(`Too many open files`);
        }
        
        this.emit('error', { service: serviceName, error: state.lastError });
        
        // Clean up PID tracker on error
        this.pidTracker.removePid(serviceName);
      });
      
      child.on('exit', (code, signal) => {
        this.handleProcessExit(serviceName, code, signal);
      });
      
      await new Promise(resolve => setTimeout(resolve, this.startupDelay));
      
      state.status = 'running';
      this.emit('status-change', { service: serviceName, status: 'running' });
      
      healthMonitor.addService(serviceName, config);
      
      // Create a unique listener for this service
      const healthCheckListener = (result) => {
        if (result.service === serviceName) {
          state.health = {
            status: result.status,
            lastCheck: result.lastCheck,
            consecutiveFailures: result.consecutiveFailures
          };
        }
      };
      
      // Store the listener so we can remove it later
      state.healthCheckListener = healthCheckListener;
      healthMonitor.on('health-check', healthCheckListener);
      
      return state;
    } catch (error) {
      state.status = 'stopped';
      state.lastError = error;
      this.processes.set(serviceName, state);
      
      // Clean up any partial initialization
      if (state.process) {
        try {
          await this.terminateProcess(state.process, state.childPids, true);
        } catch (cleanupError) {
          console.error(`Failed to cleanup after startup error:`, cleanupError);
        }
      }
      
      // Remove from PID tracker
      this.pidTracker.removePid(serviceName);
      
      this.emit('error', { service: serviceName, error });
      throw error;
    }
  }
  
  async stopService(serviceName, force = false) {
    const state = this.processes.get(serviceName);
    if (!state || state.status === 'stopped') {
      return;
    }
    
    state.status = 'stopping';
    this.emit('status-change', { service: serviceName, status: 'stopping' });
    
    if (state.process) {
      await this.terminateProcess(state.process, state.childPids, force);
    }
    
    state.status = 'stopped';
    state.process = null;
    state.pid = null;
    state.childPids = [];
    
    // Remove from PID tracker
    this.pidTracker.removePid(serviceName);
    
    // Remove health check listener if it exists
    if (state.healthCheckListener) {
      healthMonitor.removeListener('health-check', state.healthCheckListener);
      state.healthCheckListener = null;
    }
    
    healthMonitor.removeService(serviceName);
    logAggregator.removeService(serviceName);
    
    this.emit('status-change', { service: serviceName, status: 'stopped' });
  }
  
  async restartService(serviceName) {
    try {
      await this.stopService(serviceName);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await this.startService(serviceName);
    } catch (error) {
      console.error(`Failed to restart ${serviceName}:`, error);
      this.emit('error', { service: serviceName, error });
      throw error;
    }
  }
  
  async startAllServices() {
    const startupOrder = getServiceStartupOrder();
    const results = [];
    
    for (const serviceName of startupOrder) {
      try {
        const result = await this.startService(serviceName);
        results.push({ service: serviceName, success: true, result });
        await new Promise(resolve => setTimeout(resolve, this.startupDelay));
      } catch (error) {
        results.push({ service: serviceName, success: false, error });
        console.error(`Failed to start ${serviceName}:`, error);
      }
    }
    
    return results;
  }
  
  async stopAllServices() {
    const shutdownOrder = getServiceShutdownOrder();
    const promises = [];
    
    for (const serviceName of shutdownOrder) {
      promises.push(this.stopService(serviceName));
    }
    
    await Promise.all(promises);
  }
  
  getServiceState(serviceName) {
    return this.processes.get(serviceName);
  }
  
  getAllServiceStates() {
    const states = {};
    for (const [name, state] of this.processes) {
      states[name] = {
        status: state.status,
        pid: state.pid,
        startTime: state.startTime,
        restartCount: state.restartCount,
        health: state.health,
        error: state.lastError?.message
      };
    }
    return states;
  }
  
  handleProcessExit(serviceName, code, signal) {
    const state = this.processes.get(serviceName);
    if (!state) return;
    
    const wasRunning = state.status === 'running';
    state.status = 'crashed';
    state.process = null;
    state.pid = null;
    state.childPids = [];
    
    // Clean up child tracking interval
    if (state.childTrackingInterval) {
      clearInterval(state.childTrackingInterval);
      state.childTrackingInterval = null;
    }
    
    // Remove from PID tracker
    this.pidTracker.removePid(serviceName);
    
    this.emit('exit', {
      service: serviceName,
      code,
      signal,
      restartCount: state.restartCount
    });
    
    if (code !== 0) {
      state.lastError = new Error(`Process exited with code ${code}`);
    }
    
    if (this.isShuttingDown || !this.autoRestart || !wasRunning) {
      state.status = 'stopped';
      this.emit('status-change', { service: serviceName, status: 'stopped' });
      return;
    }
    
    const restartDecision = this.restartStrategy.shouldRestart(
      state.restartCount,
      state.lastRestartTime
    );
    
    if (restartDecision.shouldRestart) {
      if (restartDecision.resetCount) {
        state.restartCount = 0;
      }
      
      const delay = this.restartStrategy.calculateDelay(state.restartCount);
      state.restartCount++;
      state.lastRestartTime = Date.now();
      
      this.emit('restart-scheduled', {
        service: serviceName,
        delay,
        restartCount: state.restartCount
      });
      
      setTimeout(async () => {
        if (!this.isShuttingDown) {
          try {
            await this.startService(serviceName);
          } catch (error) {
            console.error(`Failed to restart ${serviceName} after ${state.restartCount} attempts:`, error);
            state.status = 'stopped';
            state.lastError = error;
            
            // Emit restart failure event
            this.emit('restart-failed', {
              service: serviceName,
              error,
              restartCount: state.restartCount
            });
            
            this.emit('status-change', { service: serviceName, status: 'stopped' });
          }
        }
      }, delay);
    } else {
      state.status = 'stopped';
      this.emit('status-change', { service: serviceName, status: 'stopped' });
      this.emit('max-restarts-reached', { service: serviceName });
    }
  }
  
  async terminateProcess(child, childPids = [], force = false) {
    if (!child || child.killed) return;
    
    const pid = child.pid;
    const timeout = force ? 0 : this.gracefulShutdownTimeout;
    
    return new Promise(async (resolve) => {
      let terminated = false;
      
      // Log termination attempt
      console.log(`Terminating process ${pid} with ${childPids.length} children...`);
      
      // Set up exit listener
      const exitHandler = () => {
        terminated = true;
        resolve();
      };
      
      child.once('exit', exitHandler);
      
      // Try graceful kill with timeout
      try {
        if (force) {
          // Force kill immediately
          await killProcessTree(pid, 'SIGKILL');
        } else {
          // Graceful termination with timeout
          await gracefulKill(pid, timeout);
        }
      } catch (error) {
        console.error(`Error terminating process ${pid}:`, error);
      }
      
      // Ensure all child processes are terminated
      for (const childPid of childPids) {
        if (isProcessRunning(childPid)) {
          try {
            await killProcessTree(childPid, 'SIGKILL');
          } catch (error) {
            console.error(`Error terminating child process ${childPid}:`, error);
          }
        }
      }
      
      // Final cleanup check
      setTimeout(() => {
        if (!terminated) {
          child.removeListener('exit', exitHandler);
          resolve();
        }
      }, 100);
    });
  }
  
  /**
   * Track child processes for a service
   * @private
   */
  async trackChildProcesses(serviceName, parentPid) {
    const state = this.processes.get(serviceName);
    if (!state) return;
    
    // Periodically update child process list
    const updateChildren = async () => {
      if (state.status !== 'running' || !state.process || state.process.killed) {
        return;
      }
      
      try {
        const childPids = await getProcessTree(parentPid);
        state.childPids = childPids;
        
        // Update PID tracker with children
        this.pidTracker.updatePid(serviceName, { childPids });
      } catch (error) {
        // Process might have exited - this is expected
        if (error.message && !error.message.includes('not found')) {
          console.error(`Failed to update child processes for ${serviceName}:`, error);
        }
      }
    };
    
    // Initial update
    await updateChildren();
    
    // Update every 5 seconds while running
    const interval = setInterval(async () => {
      if (state.status === 'running') {
        await updateChildren();
      } else {
        clearInterval(interval);
      }
    }, 5000);
    
    // Store interval for cleanup
    state.childTrackingInterval = interval;
  }
  
  /**
   * Clean up orphaned processes from previous runs
   * @private
   */
  async cleanupOrphanedProcesses() {
    try {
      console.log('Checking for orphaned processes from previous run...');
      const orphaned = await this.pidTracker.getOrphanedPids();
      
      for (const [serviceName, info] of Object.entries(orphaned)) {
        if (isProcessRunning(info.pid)) {
          console.warn(`Found orphaned process ${serviceName} (PID: ${info.pid}), terminating...`);
          
          try {
            // Try graceful termination first
            await gracefulKill(info.pid, 2000);
            console.log(`Successfully terminated orphaned process ${serviceName}`);
          } catch (error) {
            console.error(`Failed to kill orphaned process ${info.pid}:`, error);
            
            // Force kill as last resort
            try {
              await killProcessTree(info.pid, 'SIGKILL');
            } catch (forceError) {
              console.error(`Failed to force kill orphaned process ${info.pid}:`, forceError);
            }
          }
        }
      }
      
      // Clear the PID file after cleanup
      await this.pidTracker.clear();
      console.log('Orphaned process cleanup complete');
    } catch (error) {
      console.error('Failed to cleanup orphaned processes:', error);
    }
  }
  
  setupShutdownHandlers() {
    const shutdown = async () => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      console.log('Shutting down all services...');
      
      try {
        await this.stopAllServices();
        console.log('All services stopped successfully');
      } catch (error) {
        console.error('Error during shutdown:', error);
      }
    };
    
    app.on('before-quit', (event) => {
      if (!this.isShuttingDown) {
        event.preventDefault();
        shutdown().then(() => {
          app.exit(0);
        });
      }
    });
    
    process.on('SIGINT', () => {
      shutdown().then(() => {
        process.exit(0);
      });
    });
    
    process.on('SIGTERM', () => {
      shutdown().then(() => {
        process.exit(0);
      });
    });
  }
}

export const processManager = new ProcessManager();