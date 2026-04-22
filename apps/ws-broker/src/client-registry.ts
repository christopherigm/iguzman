import type { WebSocket } from 'ws';

interface ConnectedClient {
  ws: WebSocket;
  uuid: string;
  connectedAt: Date;
  lastSeenAt: Date;
}

const clients = new Map<string, ConnectedClient>();

export function register(uuid: string, ws: WebSocket): void {
  clients.set(uuid, { ws, uuid, connectedAt: new Date(), lastSeenAt: new Date() });
}

export function unregister(uuid: string): void {
  clients.delete(uuid);
}

export function get(uuid: string): ConnectedClient | undefined {
  return clients.get(uuid);
}

export function getAll(): ConnectedClient[] {
  return Array.from(clients.values());
}

export function isConnected(uuid: string): boolean {
  return clients.has(uuid);
}

export function touch(uuid: string): void {
  const c = clients.get(uuid);
  if (c) c.lastSeenAt = new Date();
}

export function send(uuid: string, msg: object): boolean {
  const c = clients.get(uuid);
  if (!c || c.ws.readyState !== 1 /* OPEN */) return false;
  c.ws.send(JSON.stringify(msg));
  return true;
}
