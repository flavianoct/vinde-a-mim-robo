
// ───────────────────────────────────────────────────────────────────────────
// Cloudflare Worker: roda o robô a cada minuto (Cron Trigger) e guarda o estado no KV (ligação ESTADO).
// Variáveis: INSTAGRAM_TOKEN e INSTAGRAM_USER_ID (segredos), ATIVO ("1" liga), LINK_DO_PLANO, LINK_DO_DEVOCIONAL, PALAVRAS,
// PALAVRAS_DEVOCIONAL, TOKEN_GERADO_EM. Plano grátis: no máximo 50 chamadas por execução, então cada rodada lê só os 12 posts mais
// recentes e manda no máximo 8 links.
// ───────────────────────────────────────────────────────────────────────────
const lista = (v, padrao) => String(v ?? padrao).split(',');

// No Cloudflare, chamar "fetch" guardado numa variável dá "Illegal invocation": por isso o invólucro.
const fetchDoWorker = (url, init) => fetch(url, init);

export async function rodarNoWorker(env, agora = Date.now(), fetchFn = fetchDoWorker) {
  const pular = async (motivo) => {
    console.log('robô pulado:', motivo);
    const atual = await env.ESTADO.get('status');
    if (!atual || JSON.parse(atual).pulado !== motivo) await env.ESTADO.put('status', JSON.stringify({ pulado: motivo, atualizadoEm: agora }));
    return { pulado: motivo };
  };
  if (String(env.ATIVO ?? '0') !== '1') return pular('ATIVO diferente de 1');
  if (!env.INSTAGRAM_TOKEN || !env.INSTAGRAM_USER_ID) return pular('faltam os segredos');
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
  const guardado = await env.ESTADO.get('status');
  const primeira = !guardado || JSON.parse(guardado).pulado !== undefined;
  if (erro || (resumo && resumo.enviados > 0) || Math.floor(agora / 60000) % 10 === 0 || primeira) {
    await env.ESTADO.put('painel', JSON.stringify(estado.painel));
    await env.ESTADO.put('status', JSON.stringify(status));
  }
  console.log(erro ? `erro: ${erro}` : `rodada ok: lidos ${resumo.lidos}, enviados ${resumo.enviados}${resumo.avisos.length ? ', avisos: ' + resumo.avisos.join(' | ') : ''}`);
  if (erro) throw new Error(erro);
  return { lidos: resumo.lidos, enviados: resumo.enviados, avisos: resumo.avisos };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(rodarNoWorker(env, event.scheduledTime ?? Date.now()));
  },
  async fetch(request, env, ctx) {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    // GET /rodar-agora faz uma rodada na hora (para testar sem esperar o agendamento) e mostra o resultado.
    if (new URL(request.url).pathname === '/rodar-agora') {
      try {
        return new Response(JSON.stringify(await rodarNoWorker(env)), { headers: cors });
      } catch (e) {
        return new Response(JSON.stringify({ erro: e.message }), { status: 500, headers: cors });
      }
    }
    // GET / devolve o resumo (só números e horários, sem nomes) para a página de monitoramento.
    const status = await env.ESTADO.get('status');
    return new Response(status ?? JSON.stringify({ aguardando: true }), { headers: cors });
  },
};
