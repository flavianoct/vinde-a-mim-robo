// Robô do "EU QUERO" do perfil Vinde a Mim (@mim_vinde.palavra).
// Lê os comentários dos posts recentes e as mensagens do direct; a quem escreveu "eu quero" (ou "quero"), manda o link do plano grátis no direct.
// Cada comentário/mensagem é atendido uma vez só (o estado fica em estado.json, guardado pelo workflow). Sem dependências: Node 20+.

const BASE = 'https://graph.instagram.com/v23.0';
const SETE_DIAS = 7 * 24 * 3600 * 1000;
const UM_DIA = 24 * 3600 * 1000;

export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Verdadeiro se o texto tem uma das palavras como palavra inteira ("quero" casa em "eu quero!", não em "querosene"). */
export function pedeOPlano(texto, palavras) {
  const t = ` ${normalizar(texto)} `;
  const colado = t.replace(/ /g, '');
  return palavras.some((p) => {
    const n = normalizar(p);
    return n && (t.includes(` ${n} `) || colado === n.replace(/ /g, ''));
  });
}

export class ErroInstagram extends Error {
  constructor(mensagem, fatal) {
    super(mensagem);
    this.fatal = fatal;
  }
}

export class Instagram {
  constructor(token, userId, fetchFn = fetch) {
    this.token = token;
    this.userId = userId;
    this.fetchFn = fetchFn;
  }

  async chamar(metodo, caminho, params = {}) {
    const corpo = new URLSearchParams({ ...params, access_token: this.token });
    let r;
    try {
      r = await this.fetchFn(metodo === 'GET' ? `${BASE}/${caminho}?${corpo}` : `${BASE}/${caminho}`, {
        method: metodo,
        headers: metodo === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
        body: metodo === 'POST' ? corpo : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErroInstagram(`Sem conexão com o Instagram: ${e.message}`, false);
    }
    const dados = await r.json().catch(() => ({}));
    if (r.ok && !dados.error) return dados;
    const erro = dados.error ?? {};
    // 190 = token inválido ou vencido; 10 e 200 = falta de permissão.
    const fatal = erro.code === 190 || erro.code === 10 || erro.code === 200 || r.status === 401 || r.status === 403;
    throw new ErroInstagram(`Instagram recusou (${r.status}${erro.code ? `/${erro.code}` : ''}): ${erro.message ?? 'erro desconhecido'}`, fatal);
  }

  async meuUsuario() {
    return String((await this.chamar('GET', this.userId, { fields: 'username' })).username ?? '').toLowerCase();
  }

  async midiasRecentes(limite = 25) {
    const r = await this.chamar('GET', `${this.userId}/media`, { fields: 'id,timestamp', limit: String(limite) });
    return (r.data ?? []).map((m) => ({ id: String(m.id), publicadoEm: Date.parse(m.timestamp ?? '') || 0 }));
  }

  async comentarios(mediaId) {
    const r = await this.chamar('GET', `${mediaId}/comments`, { fields: 'id,text,username,timestamp', limit: '50' });
    return (r.data ?? []).map((c) => ({ id: String(c.id), texto: String(c.text ?? ''), usuario: String(c.username ?? '').toLowerCase(), em: Date.parse(c.timestamp ?? '') || 0 }));
  }

  /** Resposta privada a um comentário: chega no direct de quem comentou (uma por comentário, em até 7 dias). */
  async direcAoComentario(commentId, texto) {
    await this.chamar('POST', `${this.userId}/messages`, { recipient: JSON.stringify({ comment_id: commentId }), message: JSON.stringify({ text: texto }) });
  }

  async responderComentario(commentId, texto) {
    await this.chamar('POST', `${commentId}/replies`, { message: texto });
  }

  /** Conversas do direct com as últimas mensagens de cada uma. */
  async conversas() {
    const r = await this.chamar('GET', `${this.userId}/conversations`, { platform: 'instagram', fields: 'id,messages.limit(5){id,message,from,created_time}', limit: '25' });
    return r.data ?? [];
  }

  /** Mensagem no direct a quem escreveu para a conta (vale em até 24 horas depois da mensagem dela). */
  async direcParaPessoa(idDaPessoa, texto) {
    await this.chamar('POST', `${this.userId}/messages`, { recipient: JSON.stringify({ id: idDaPessoa }), message: JSON.stringify({ text: texto }) });
  }
}

const RESPOSTAS_PUBLICAS = ['Te mandei no direct! 📩', 'Mandei o link no seu direct 📩', 'Enviado! Olha o seu direct 📩', 'Prontinho, link no direct 📩', 'Olha lá no seu direct 😉'];

export function textoDoDirect(link) {
  return `Oi! 🤍 Que bom que você quis.\n\nAqui está o seu plano grátis de 30 dias de paz (um versículo, uma reflexão curta e uma oração por dia):\n\n${link}\n\nÉ só colocar o seu nome e e-mail que o PDF abre na hora. Que Deus acalme o seu coração hoje. 🕊️`;
}

export function textoDoDevocional(link) {
  return `Oi! 🤍 Que bom o seu interesse.\n\nO devocional "Vinde a Mim: 40 dias de descanso em Deus" tem uma palavra, uma reflexão e uma oração por dia, pra quem está cansada e com a mente cheia. Dá pra ver tudo, e comprar se quiser, por aqui:\n\n${link}\n\nSe tiver qualquer dúvida, é só me escrever. Que Deus abençoe o seu dia. 🕊️`;
}

/**
 * Uma rodada. `estado` = { comentarios: {id: ts}, mensagens: {id: ts} } é alterado no lugar.
 * Duas respostas possíveis: a palavra do plano grátis ("eu quero") manda `link`; a do devocional pago ("devocional", "40 dias")
 * manda `linkDevocional` (se vier). A do devocional vence quando o texto tem as duas ("eu quero o devocional").
 * Devolve { lidos, enviados, avisos }. Erro fatal (token vencido, falta de permissão) é lançado para a rodada falhar e o GitHub avisar.
 */
export async function rodar({ api, estado, link, palavras, linkDevocional, palavrasDevocional = [], limite = 20, maxMidias = 25, agora = Date.now(), pausar = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const resumo = { lidos: 0, enviados: 0, avisos: [], eventos: [] };
  estado.comentarios ??= {};
  estado.mensagens ??= {};
  const mensagemGratis = textoDoDirect(link);
  const mensagemPaga = linkDevocional ? textoDoDevocional(linkDevocional) : undefined;
  /** O que mandar para um texto: { devocional: boolean, mensagem } ou undefined se não pediu nada. */
  const escolher = (texto) => {
    if (mensagemPaga && pedeOPlano(texto, palavrasDevocional)) return { devocional: true, mensagem: mensagemPaga };
    if (pedeOPlano(texto, palavras)) return { devocional: false, mensagem: mensagemGratis };
    return undefined;
  };
  const eu = await api.meuUsuario();
  let semAcesso = 0;
  let falhas = 0;

  for (const midia of await api.midiasRecentes(maxMidias)) {
    if (agora - midia.publicadoEm > SETE_DIAS + UM_DIA) continue;
    if (resumo.enviados >= limite) break;
    let lista;
    try {
      lista = await api.comentarios(midia.id);
    } catch (e) {
      if (e.fatal) throw e;
      semAcesso++;
      continue;
    }
    for (const c of lista) {
      if (resumo.enviados >= limite) break;
      resumo.lidos++;
      if (estado.comentarios[c.id]) continue;
      if (c.usuario === eu) continue;
      const escolha = escolher(c.texto);
      if (!escolha) continue;
      // Passou de 7 dias: o Instagram não aceita mais resposta privada. Anota e segue.
      if (c.em && agora - c.em > SETE_DIAS) {
        estado.comentarios[c.id] = agora;
        continue;
      }
      // Anota ANTES de mandar: se a rodada cair no meio, a pessoa não recebe o link duas vezes.
      estado.comentarios[c.id] = agora;
      try {
        await api.direcAoComentario(c.id, escolha.mensagem);
      } catch (e) {
        if (e.fatal) {
          delete estado.comentarios[c.id];
          throw e;
        }
        falhas++;
        resumo.avisos.push(`Comentário ${c.id}: ${e.message}`);
        continue;
      }
      resumo.enviados++;
      resumo.eventos.push(escolha.devocional ? 'comentário-devocional' : 'comentário');
      try {
        await api.responderComentario(c.id, RESPOSTAS_PUBLICAS[Math.abs(hash(c.id)) % RESPOSTAS_PUBLICAS.length]);
      } catch {
        // A resposta pública é um extra: o link já foi no direct.
      }
      await pausar(1500);
    }
  }
  if (semAcesso) resumo.avisos.push(`${semAcesso} post(s) sem leitura de comentários.`);

  // Direct: quem escreveu "eu quero" direto na conversa (só dentro das 24 horas da mensagem).
  try {
    for (const conversa of await api.conversas()) {
      for (const m of conversa.messages?.data ?? []) {
        if (resumo.enviados >= limite) break;
        const de = String(m.from?.id ?? '');
        const username = String(m.from?.username ?? '').toLowerCase();
        if (!de || de === String(api.userId) || (eu && username === eu)) continue;
        if (estado.mensagens[m.id]) continue;
        const escolha = escolher(m.message);
        if (!escolha) continue;
        const quando = Date.parse(m.created_time ?? '') || 0;
        estado.mensagens[m.id] = agora;
        if (quando && agora - quando > UM_DIA) continue;
        try {
          await api.direcParaPessoa(de, escolha.mensagem);
          resumo.enviados++;
          resumo.eventos.push(escolha.devocional ? 'direct-devocional' : 'direct');
          await pausar(1500);
        } catch (e) {
          if (e.fatal) {
            delete estado.mensagens[m.id];
            throw e;
          }
          resumo.avisos.push(`Direct ${m.id}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    if (e.fatal) throw e;
    resumo.avisos.push(`Direct: ${e.message}`);
  }

  // O estado não pode crescer para sempre: esquece o que tem mais de 30 dias.
  for (const grupo of [estado.comentarios, estado.mensagens]) for (const [id, ts] of Object.entries(grupo)) if (agora - ts > 30 * UM_DIA) delete grupo[id];
  if (falhas >= 3 && resumo.enviados === 0) resumo.avisos.push('O Instagram recusou vários direct seguidos: confira se o app da Meta tem o acesso avançado a instagram_business_manage_messages.');
  return resumo;
}

/**
 * Resumo que a página de monitoramento lê (status.json). Só números, horários e avisos: o repositório é público,
 * então nunca entram nomes de quem comentou. O histórico fica em estado.painel e cresce até 100 eventos.
 */
export function atualizarPainel(estado, r, erro, agora = Date.now(), tokenGeradoEm = '') {
  const p = (estado.painel ??= { total: 0, porDia: {}, eventos: [], rodadas: 0 });
  const dia = new Date(agora - 3 * 3600_000).toISOString().slice(0, 10); // dia em Brasília
  p.rodadas++;
  p.ultimaRodada = agora;
  if (erro) {
    p.ultimoErro = { em: agora, mensagem: String(erro).slice(0, 300) };
    p.ok = false;
  } else {
    p.ok = true;
    p.ultimoLido = r.lidos;
    p.avisos = r.avisos.slice(0, 5).map((a) => String(a).slice(0, 200));
    p.total += r.enviados;
    if (r.enviados) p.porDia[dia] = (p.porDia[dia] ?? 0) + r.enviados;
    for (const tipo of r.eventos) p.eventos.unshift({ em: agora, tipo });
    p.eventos = p.eventos.slice(0, 100);
    for (const d of Object.keys(p.porDia)) if (Date.parse(d) < agora - 60 * UM_DIA) delete p.porDia[d];
  }
  return { ...p, tokenGeradoEm, atualizadoEm: agora };
}

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

// ───────────────────────────────────────────────────────────────────────────
// Cloudflare Worker: roda o robô a cada minuto (Cron Trigger) e guarda o estado no KV (ligação ESTADO).
// Variáveis: INSTAGRAM_TOKEN e INSTAGRAM_USER_ID (segredos), ATIVO ("1" liga), LINK_DO_PLANO, LINK_DO_DEVOCIONAL, PALAVRAS,
// PALAVRAS_DEVOCIONAL, TOKEN_GERADO_EM. Plano grátis: no máximo 50 chamadas por execução, então cada rodada lê só os 12 posts mais
// recentes e manda no máximo 8 links.
// ───────────────────────────────────────────────────────────────────────────
const lista = (v, padrao) => String(v ?? padrao).split(',');

export async function rodarNoWorker(env, agora = Date.now(), fetchFn = fetch) {
  if (String(env.ATIVO ?? '0') !== '1') return { pulado: 'ATIVO diferente de 1' };
  if (!env.INSTAGRAM_TOKEN || !env.INSTAGRAM_USER_ID) return { pulado: 'faltam os segredos' };
  const lido = JSON.parse((await env.ESTADO.get('estado')) ?? '{}');
  const estado = { comentarios: lido.comentarios ?? {}, mensagens: lido.mensagens ?? {}, painel: JSON.parse((await env.ESTADO.get('painel')) ?? 'null') ?? undefined };
  if (!estado.painel) delete estado.painel;
  const antes = JSON.stringify({ c: estado.comentarios, m: estado.mensagens });
  let resumo, erro;
  try {
    resumo = await rodar({
      api: new Instagram(env.INSTAGRAM_TOKEN.trim(), String(env.INSTAGRAM_USER_ID).trim(), fetchFn),
      estado,
      link: env.LINK_DO_PLANO ?? 'https://flaviocoelhotoledo.systeme.io/30-dias-de-paz',
      palavras: lista(env.PALAVRAS, 'eu quero,quero,euquero'),
      linkDevocional: env.LINK_DO_DEVOCIONAL || undefined,
      palavrasDevocional: lista(env.PALAVRAS_DEVOCIONAL, 'devocional,40 dias,40dias'),
      limite: 8,
      maxMidias: 12,
      agora,
    });
  } catch (e) {
    erro = e.message;
  }
  const status = atualizarPainel(estado, resumo, erro, agora, env.TOKEN_GERADO_EM ?? '');
  // O plano grátis do KV aceita 1.000 gravações por dia: o estado só é gravado se mudou, e o painel a cada 10 minutos (ou quando há novidade).
  const depois = JSON.stringify({ c: estado.comentarios, m: estado.mensagens });
  if (depois !== antes) await env.ESTADO.put('estado', JSON.stringify({ comentarios: estado.comentarios, mensagens: estado.mensagens }));
  if (erro || (resumo && resumo.enviados > 0) || Math.floor(agora / 60000) % 10 === 0 || !(await env.ESTADO.get('status'))) {
    await env.ESTADO.put('painel', JSON.stringify(estado.painel));
    await env.ESTADO.put('status', JSON.stringify(status));
  }
  if (erro) throw new Error(erro);
  return { lidos: resumo.lidos, enviados: resumo.enviados, avisos: resumo.avisos };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(rodarNoWorker(env, event.scheduledTime ?? Date.now()));
  },
  // GET / ou /status devolve o resumo (só números e horários, sem nomes) para a página de monitoramento.
  async fetch(request, env) {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    const status = await env.ESTADO.get('status');
    return new Response(status ?? JSON.stringify({ aguardando: true }), { headers: cors });
  },
};
