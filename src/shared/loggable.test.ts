import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loggable } from './loggable';

const SECRETS = ['Basic c2VjcmV0', 'refresh_token=abc', 'sk=session'];

async function failure(url: string): Promise<unknown> {
  try {
    await axios.post(url, 'refresh_token=abc', { headers: { Authorization: 'Basic c2VjcmV0' } });
  } catch (err) {
    return err;
  }
  throw new Error('request unexpectedly succeeded');
}

describe('loggable', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'temporarily_unavailable' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('summarizes an HTTP error as request line, status and body', async () => {
    const text = loggable(await failure(`${base}/api/token?sk=session`));
    expect(text).toBe(`POST ${base}/api/token failed with 503: {"error":"temporarily_unavailable"}`);
  });

  it('names the cause of a request that got no response', async () => {
    // Close a server to get a port nothing is listening on
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const text = loggable(await failure(`http://127.0.0.1:${port}/x?sk=session`));
    expect(text).toMatch(/^POST http:\/\/127\.0\.0\.1:\d+\/x failed without a response: .*ECONNREFUSED/);
  });

  it('never includes credentials from the request', async () => {
    const text = String(loggable(await failure(`${base}/api/token?sk=session`)));
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it('passes other errors through unchanged', () => {
    const err = new Error('boom');
    expect(loggable(err)).toBe(err);
  });
});
