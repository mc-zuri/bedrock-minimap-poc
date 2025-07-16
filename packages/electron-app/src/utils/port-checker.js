import net from 'net';

export async function checkPort(port, host = 'localhost') {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    
    server.listen(port, host);
  });
}

export async function findAvailablePort(startPort, endPort = startPort + 100) {
  for (let port = startPort; port <= endPort; port++) {
    if (await checkPort(port)) {
      return port;
    }
  }
  throw new Error(`No available ports found between ${startPort} and ${endPort}`);
}

export async function getPortStatus(port, host = 'localhost') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = 'unknown';
    
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      status = 'in-use';
      socket.destroy();
    });
    
    socket.on('timeout', () => {
      status = 'available';
      socket.destroy();
    });
    
    socket.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        status = 'available';
      } else {
        status = 'error';
      }
    });
    
    socket.on('close', () => {
      resolve(status);
    });
    
    socket.connect(port, host);
  });
}