import { describe, it, expect, vi, beforeEach } from 'vitest';
import consumer from '../workers/broadcast-queue';

class FakeD1 {
  runs: string[] = [];
  configs: Record<string, any>;
  constructor(configs: Record<string, any> = {}) {
    this.configs = configs;
  }
  prepare(sql: string) {
    return {
      bind: (...args: any[]) => ({
        first: async () => this.configs[args[0]] ?? null,
        all: async () => ({ results: [] }),
        run: async () => { this.runs.push(sql); return { success: true }; },
      }),
    };
  }
}

const makeBatch = (messages: any[]) => ({
  messages: messages.map((body, i) => ({
    id: `msg-${i}`,
    body,
    timestamp: new Date(),
    ack: vi.fn(),
    retry: vi.fn(),
  })),
  queue: 'BROADCAST_QUEUE',
});

const baseMsg = {
  campaignId: 'camp-1',
  workspaceId: 'ws-1',
  contactId: 'ct-1',
  phoneId: '111222333',
  templateName: 'welcome',
  languageCode: 'en_US',
  parameters: ['John'],
  toPhone: '919999999999',
};

describe('broadcast queue consumer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a template message via Meta API and records success', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => '{}',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const db = new FakeD1({ '111222333': { access_token: 'secret-token' } });
    const batch = makeBatch([baseMsg]);
    await consumer.queue(batch as any, { DB: db } as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://graph.facebook.com/v19.0/111222333/messages');
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer secret-token' });

    const body = JSON.parse(init!.body as string);
    expect(body.to).toBe('919999999999');
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('welcome');
    expect(body.template.language.code).toBe('en_US');
    expect(body.template.components[0].parameters).toEqual([{ type: 'text', text: 'John' }]);

    expect(batch.messages[0].ack).toHaveBeenCalled();
    expect(db.runs.some(r => r.includes('successful_sends'))).toBe(true);
    expect(db.runs.some(r => r.includes('failed_sends'))).toBe(false);
  });

  it('sends without components when no parameters', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({ ok: true, status: 200, text: async () => '{}' }));
    vi.stubGlobal('fetch', fetchMock);

    const db = new FakeD1({ '111222333': { access_token: 't' } });
    const batch = makeBatch([{ ...baseMsg, parameters: [] }]);
    await consumer.queue(batch as any, { DB: db } as any);

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.template.components).toBeUndefined();
  });

  it('increments failed_sends on WhatsApp API error', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"template not approved"}}',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const db = new FakeD1({ '111222333': { access_token: 't' } });
    const batch = makeBatch([baseMsg]);
    await consumer.queue(batch as any, { DB: db } as any);

    expect(db.runs.some(r => r.includes('failed_sends'))).toBe(true);
    expect(db.runs.some(r => r.includes('successful_sends'))).toBe(false);
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it('increments failed_sends and acks when config/token is missing', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
    vi.stubGlobal('fetch', fetchMock);

    const db = new FakeD1({}); // no access_token row for phoneId
    const batch = makeBatch([baseMsg]);
    await consumer.queue(batch as any, { DB: db } as any);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.runs.some(r => r.includes('failed_sends'))).toBe(true);
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it('increments failed_sends when phone number is missing', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
    vi.stubGlobal('fetch', fetchMock);

    const db = new FakeD1({ '111222333': { access_token: 't' } });
    const batch = makeBatch([{ ...baseMsg, toPhone: '' }]);
    await consumer.queue(batch as any, { DB: db } as any);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.runs.some(r => r.includes('failed_sends'))).toBe(true);
  });

  it('acknowledges every message even when processing throws', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down'); });
    vi.stubGlobal('fetch', fetchMock);

    const db = new FakeD1({ '111222333': { access_token: 't' } });
    const batch = makeBatch([baseMsg]);
    await consumer.queue(batch as any, { DB: db } as any);

    expect(batch.messages[0].ack).toHaveBeenCalled();
    expect(db.runs.some(r => r.includes('failed_sends'))).toBe(true);
  });
});
