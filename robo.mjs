import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Instagram, rodar, atualizarPainel } from './nucleo.mjs';

export * from './nucleo.mjs';

// Execução pelo terminal / GitHub Actions: node robo.mjs
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const token = (process.env.INSTAGRAM_TOKEN ?? '').trim();
  const userId = (process.env.INSTAGRAM_USER_ID ?? '').trim();
  const link = (process.env.LINK_DO_PLANO ?? 'https://flaviocoelhotoledo.systeme.io/30-dias-de-paz').trim();
  const palavras = (process.env.PALAVRAS ?? 'eu quero,quero,euquero').split(',');
  if (!token || !userId) {
    // Ainda não configurado: espera em silêncio (sem falhar, para o GitHub não mandar e-mail de erro a cada rodada).
    console.log('::notice::Robô aguardando: cadastre os Secrets INSTAGRAM_TOKEN e INSTAGRAM_USER_ID no repositório.');
    process.exit(0);
  }
  const arquivo = process.env.ARQUIVO_DO_ESTADO ?? 'estado.json';
  const estado = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {};
  const tokenGeradoEm = (process.env.TOKEN_GERADO_EM ?? '').trim();
  const salvar = (r, erro) => {
    writeFileSync(arquivo, JSON.stringify(estado));
    writeFileSync(process.env.ARQUIVO_DO_PAINEL ?? 'status.json', JSON.stringify(atualizarPainel(estado, r, erro, Date.now(), tokenGeradoEm)));
  };
  try {
    const linkDevocional = (process.env.LINK_DO_DEVOCIONAL ?? '').trim() || undefined;
    const palavrasDevocional = (process.env.PALAVRAS_DEVOCIONAL ?? 'devocional,40 dias,40dias').split(',');
    const r = await rodar({ api: new Instagram(token, userId), estado, link, palavras, linkDevocional, palavrasDevocional });
    console.log(`Lidos: ${r.lidos} · links enviados: ${r.enviados}`);
    for (const a of r.avisos) console.log(`::warning::${a}`);
    salvar(r);
  } catch (e) {
    console.error(`::error::${e.message}`);
    salvar(undefined, e.message);
    process.exit(1);
  }
}
