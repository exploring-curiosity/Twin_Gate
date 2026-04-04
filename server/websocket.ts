import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[ws] Client connected');
    ws.send(JSON.stringify({ type: 'connected', data: { timestamp: Date.now() } }));

    ws.on('close', () => {
      console.log('[ws] Client disconnected');
    });
  });

  console.log('[ws] WebSocket server initialized');
}

export function broadcast(message: { type: string; data: unknown }) {
  if (!wss) return;
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}
