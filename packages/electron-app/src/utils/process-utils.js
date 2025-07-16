import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import treeKill from 'tree-kill';

const execAsync = promisify(exec);

/**
 * Check if a process is running by PID
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process is running
 */
export function isProcessRunning(pid) {
  if (!pid || pid <= 0) return false;
  
  try {
    if (process.platform === 'win32') {
      // Windows: Use PowerShell to check if process exists
      const result = execSync(`powershell -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"`, {
        encoding: 'utf8',
        windowsHide: true
      });
      return result.trim() === pid.toString();
    } else {
      // Unix: Use kill -0 to check if process exists
      process.kill(pid, 0);
      return true;
    }
  } catch (error) {
    // Process doesn't exist or we don't have permission
    return false;
  }
}

/**
 * Get all child PIDs for a given parent PID
 * @param {number} pid - Parent process ID
 * @returns {Promise<number[]>} Array of child PIDs
 */
export async function getProcessTree(pid) {
  if (!pid || pid <= 0) return [];
  
  try {
    if (process.platform === 'win32') {
      // Windows: Use PowerShell to get child processes
      const { stdout } = await execAsync(
        `powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} } | Select-Object -ExpandProperty ProcessId"`,
        { windowsHide: true }
      );
      
      const childPids = stdout
        .split('\n')
        .map(line => parseInt(line.trim(), 10))
        .filter(p => !isNaN(p));
      
      // Recursively get children of children
      const allPids = [...childPids];
      for (const childPid of childPids) {
        const grandChildren = await getProcessTree(childPid);
        allPids.push(...grandChildren);
      }
      
      return allPids;
    } else {
      // Unix: Use ps to get child processes
      const { stdout } = await execAsync(
        `ps -o pid= --ppid ${pid}`,
        { encoding: 'utf8' }
      );
      
      const childPids = stdout
        .split('\n')
        .map(line => parseInt(line.trim(), 10))
        .filter(p => !isNaN(p));
      
      // Recursively get children of children
      const allPids = [...childPids];
      for (const childPid of childPids) {
        const grandChildren = await getProcessTree(childPid);
        allPids.push(...grandChildren);
      }
      
      return allPids;
    }
  } catch (error) {
    // Process might have already exited
    return [];
  }
}

/**
 * Kill a process and all its children
 * @param {number} pid - Process ID to kill
 * @param {string} signal - Signal to send (SIGTERM, SIGKILL, etc.)
 * @returns {Promise<void>}
 */
export async function killProcessTree(pid, signal = 'SIGTERM') {
  if (!pid || pid <= 0) return;
  
  return new Promise((resolve, reject) => {
    treeKill(pid, signal, (err) => {
      if (err) {
        // Fallback to manual implementation if tree-kill fails
        killProcessTreeFallback(pid, signal)
          .then(resolve)
          .catch(reject);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Fallback implementation for killing process tree
 * @private
 */
async function killProcessTreeFallback(pid, signal) {
  if (!pid || pid <= 0) return;
  
  try {
    // Get all child processes first
    const childPids = await getProcessTree(pid);
    
    if (process.platform === 'win32') {
      // Windows: Use taskkill with tree flag
      if (signal === 'SIGKILL' || signal === 9) {
        await execAsync(`taskkill /pid ${pid} /t /f`, { windowsHide: true });
      } else {
        await execAsync(`taskkill /pid ${pid} /t`, { windowsHide: true });
      }
    } else {
      // Unix: Kill child processes first, then parent
      for (const childPid of childPids.reverse()) {
        try {
          process.kill(childPid, signal);
        } catch (e) {
          // Process might have already exited
        }
      }
      
      // Kill the parent process
      try {
        process.kill(pid, signal);
      } catch (e) {
        // Process might have already exited
      }
    }
  } catch (error) {
    // If process doesn't exist, that's okay
    if (!error.message.includes('not found') && !error.message.includes('No such process')) {
      throw error;
    }
  }
}

/**
 * Create a Windows job object for process grouping
 * Note: This is a placeholder - actual implementation would require native modules
 * @returns {object|null} Job object handle or null if not supported
 */
export function createWindowsJobObject() {
  // This would require native Node.js modules or electron-specific APIs
  // For now, return null to indicate not supported
  // In a real implementation, you'd use node-windows or similar
  return null;
}

/**
 * Kill a process gracefully with timeout
 * @param {number} pid - Process ID
 * @param {number} timeout - Timeout in milliseconds before force kill
 * @returns {Promise<void>}
 */
export async function gracefulKill(pid, timeout = 5000) {
  if (!pid || pid <= 0) return;
  
  return new Promise(async (resolve) => {
    let killed = false;
    
    // Set up timeout for force kill
    const timer = setTimeout(async () => {
      if (!killed && isProcessRunning(pid)) {
        console.warn(`Process ${pid} did not terminate gracefully, force killing...`);
        await killProcessTree(pid, 'SIGKILL');
      }
      killed = true;
      resolve();
    }, timeout);
    
    // Try graceful termination first
    try {
      await killProcessTree(pid, 'SIGTERM');
      
      // Check if process terminated
      const checkInterval = setInterval(() => {
        if (!isProcessRunning(pid)) {
          clearInterval(checkInterval);
          clearTimeout(timer);
          killed = true;
          resolve();
        }
      }, 100);
    } catch (error) {
      clearTimeout(timer);
      killed = true;
      resolve();
    }
  });
}

/**
 * Get process command line (for debugging/logging)
 * @param {number} pid - Process ID
 * @returns {Promise<string|null>} Command line or null if not found
 */
export async function getProcessCommand(pid) {
  if (!pid || pid <= 0) return null;
  
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        `powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} } | Select-Object -ExpandProperty CommandLine"`,
        { windowsHide: true, encoding: 'utf8' }
      );
      return stdout.trim() || null;
    } else {
      const { stdout } = await execAsync(
        `ps -p ${pid} -o command=`,
        { encoding: 'utf8' }
      );
      return stdout.trim() || null;
    }
  } catch (error) {
    return null;
  }
}