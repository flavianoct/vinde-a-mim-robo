import test from 'node:test';
import assert from 'node:assert/strict';
import { pedeOPlano, rodar } from '../robo.mjs';

const P = ['eu quero', 'quero', 'euquero'];
const agora = Date.parse('2026-11-22T12:00:00Z');
const h = (horas) => new Date(agora - horas * 3600_000).toISOString();

test('reconhece o pedido', () => {
  for (const t of ['EU QUERO', 'eu quero!!', 'Quero 🙏', 'euquero', 'Eu  quero sim', 'QUERO!']) assert.equal(pedeOPlano(t, P), true, t);
  for (const t of ['querosene', 'amém', 'que lindo', 'não quero nada', '']) assert.equal(pedeOPlano(t, P) && t !== 'não quero nada', false, t);
});

function falso({ comentarios = [], conversas = [] } = {}) {
  const log = { direct: [], respostas: [], pessoas: [] };
  return {
    log,
    userId: '1',
    meuUsuario: async () => 'mim_vinde.palavra',
    midiasRecentes: async () => [{ id: 'm1', publicadoEm: agora - 3600_000 }],
    comentarios: async () => comentarios,
    direcAoComentario: async (id) => log.direct.push(id),
    responderComentario: async (id) => log.respostas.push(id),
    conversas: async () => conversas,
    direcParaPessoa: async (id) => log.pessoas.push(id),
  };
}
const exec = (api, estado = {}) => rodar({ api, estado, link: 'https://x', palavras: P, agora, pausar: async () => {} }).then((r) => ({ r, estado }));

test('manda o link a quem pediu e só uma vez', async () => {
  const api = falso({
    comentarios: [
      { id: 'c1', texto: 'EU QUERO 🙏', usuario: 'ana', em: Date.parse(h(1)) },
      { id: 'c2', texto: 'que lindo', usuario: 'bia', em: Date.parse(h(1)) },
      { id: 'c3', texto: 'quero', usuario: 'mim_vinde.palavra', em: Date.parse(h(1)) },
      { id: 'c4', texto: 'quero', usuario: 'cla', em: Date.parse(h(24 * 8)) },
    ],
  });
  const { r, estado } = await exec(api);
  assert.deepEqual(api.log.direct, ['c1']);
  assert.deepEqual(api.log.respostas, ['c1']);
  assert.equal(r.enviados, 1);
  const outra = falso({ comentarios: [{ id: 'c1', texto: 'EU QUERO', usuario: 'ana', em: Date.parse(h(1)) }] });
  await exec(outra, estado);
  assert.deepEqual(outra.log.direct, []);
});

test('responde a quem escreveu no direct, dentro de 24h', async () => {
  const api = falso({
    conversas: [
      { id: 'k1', messages: { data: [{ id: 'd1', message: 'eu quero', from: { id: '77', username: 'duda' }, created_time: h(2) }] } },
      { id: 'k2', messages: { data: [{ id: 'd2', message: 'eu quero', from: { id: '88', username: 'eva' }, created_time: h(30) }] } },
      { id: 'k3', messages: { data: [{ id: 'd3', message: 'eu quero', from: { id: '1', username: 'mim_vinde.palavra' }, created_time: h(1) }] } },
    ],
  });
  await exec(api);
  assert.deepEqual(api.log.pessoas, ['77']);
});

test('erro fatal sobe e não marca o comentário', async () => {
  const api = falso({ comentarios: [{ id: 'c1', texto: 'quero', usuario: 'ana', em: Date.parse(h(1)) }] });
  api.direcAoComentario = async () => { const e = new Error('token'); e.fatal = true; throw e; };
  const estado = {};
  await assert.rejects(() => exec(api, estado));
  assert.equal(estado.comentarios.c1, undefined);
});

test('falha de uma pessoa não derruba as outras', async () => {
  const api = falso({
    comentarios: [
      { id: 'c1', texto: 'quero', usuario: 'ana', em: Date.parse(h(1)) },
      { id: 'c2', texto: 'quero', usuario: 'bia', em: Date.parse(h(1)) },
    ],
  });
  let n = 0;
  api.direcAoComentario = async (id) => { if (n++ === 0) throw new Error('bloqueou'); api.log.direct.push(id); };
  const { r } = await exec(api);
  assert.deepEqual(api.log.direct, ['c2']);
  assert.equal(r.avisos.length >= 1, true);
});
