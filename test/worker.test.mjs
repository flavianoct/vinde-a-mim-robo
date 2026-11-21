import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync('node', ['scripts/construir-worker.cjs']);
const { rodarNoWorker, default: worker } = await import('../cloudflare/worker.js');

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) }; };
const agora = Date.parse('2026-11-22T12:00:00Z');
const resp = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
function instagramFalso(comentarios) {
  const chamadas = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    chamadas.push((init.method ?? 'GET') + ' ' + u.split('?')[0].replace('https://graph.instagram.com/v23.0/', ''));
    if (u.includes('/media?')) return resp({ data: [{ id: 'm1', timestamp: new Date(agora - 3600e3).toISOString() }] });
    if (u.includes('m1/comments')) return resp({ data: comentarios });
    if (u.includes('/conversations')) return resp({ data: [] });
    if (u.includes('/1?') || u.endsWith('/1')) return resp({ username: 'mim_vinde.palavra' });
    return resp({ id: 'ok' });
  };
  return { f, chamadas };
}
const env = (extra = {}) => ({ INSTAGRAM_TOKEN: 't', INSTAGRAM_USER_ID: '1', ATIVO: '1', LINK_DO_DEVOCIONAL: 'https://v', ESTADO: kv(), ...extra });

test('worker: desligado não faz nada', async () => {
  const e = env({ ATIVO: '0' });
  const r = await rodarNoWorker(e, agora, instagramFalso([]).f);
  assert.ok(r.pulado);
});

test('worker: manda o link, grava o estado e não repete na rodada seguinte', async () => {
  const e = env();
  const com = [{ id: 'c1', text: 'EU QUERO', username: 'ana', timestamp: new Date(agora - 600e3).toISOString() }];
  const a = instagramFalso(com);
  const r = await rodarNoWorker(e, agora, a.f);
  assert.equal(r.enviados, 1);
  assert.ok(a.chamadas.some((c) => c.startsWith('POST') && c.endsWith('/messages')));
  assert.ok(JSON.parse(e.ESTADO.m.get('estado')).comentarios.c1);
  const b = instagramFalso(com);
  const r2 = await rodarNoWorker(e, agora + 60e3, b.f);
  assert.equal(r2.enviados, 0);
  assert.ok(a.chamadas.length < 50);
  const resposta = await worker.fetch(new Request('https://x/status'), e);
  const s = await resposta.json();
  assert.equal(s.total, 1);
  assert.equal(resposta.headers.get('access-control-allow-origin'), '*');
});
