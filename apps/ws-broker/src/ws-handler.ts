import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { findClientByUuid, touchClient, updateJob } from './db.js';
import * as registry from './client-registry.js';
import { notifyJobComplete } from './notifier.js';
import type { ClientMessage, ServerMessage } from './types.js';
import logger from './logger.js';

function send(ws: import('ws').WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

export function attachWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    let uuid: string | null = null;

    const authTimeout = setTimeout(() => {
      if (!uuid) {
        ws.close(4001, 'Auth timeout');
      }
    }, 10_000);

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'auth') {
        clearTimeout(authTimeout);
        const client = await findClientByUuid(msg.uuid);
        if (!client) {
          ws.close(4001, 'Unauthorized');
          return;
        }
        uuid = msg.uuid;
        registry.register(uuid, ws);
        await touchClient(uuid);
        send(ws, { type: 'ack' });
        logger.info({ uuid }, 'Client authenticated');
        return;
      }

      if (!uuid) {
        ws.close(4001, 'Not authenticated');
        return;
      }

      registry.touch(uuid);

      if (msg.type === 'ping') {
        send(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'progress') {
        await updateJob(msg.jobId, { progress: msg.percent, status: 'processing' });
        return;
      }

      if (msg.type === 'done') {
        await updateJob(msg.jobId, {
          status: 'done',
          outputFile: msg.outputFile,
          completedAt: new Date(),
        });
        await notifyJobComplete(msg.jobId, { success: true, outputFile: msg.outputFile });
        return;
      }

      if (msg.type === 'error') {
        await updateJob(msg.jobId, {
          status: 'error',
          error: msg.error,
          completedAt: new Date(),
        });
        await notifyJobComplete(msg.jobId, { success: false, error: msg.error });
        return;
      }
    });

    ws.on('close', () => {
      if (uuid) {
        registry.unregister(uuid);
        logger.info({ uuid }, 'Client disconnected');
      }
      clearTimeout(authTimeout);
    });

    ws.on('error', (err) => {
      logger.error({ err, uuid }, 'WS socket error');
    });
  });

  return wss;
}
