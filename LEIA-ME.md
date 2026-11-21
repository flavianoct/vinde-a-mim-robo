# Robô do EU QUERO — Vinde a Mim

Roda no GitHub Actions a cada 5 minutos. Lê os comentários dos Reels dos últimos dias e as mensagens do direct;
quem escreve "eu quero", "quero" ou "euquero" recebe o link do plano grátis (https://flaviocoelhotoledo.systeme.io/30-dias-de-paz) no direct,
e o comentário ganha a resposta "Te mandei no direct! 📩". Cada pessoa recebe uma vez só.

## O que precisa (uma vez)
1. Conta do Instagram **profissional** (já é).
2. App na Meta (pode ser o mesmo do robô de ofertas) com o produto **API do Instagram com login do Instagram**.
   Adicionar `@mim_vinde.palavra` como testador/desenvolvedor do app e aceitar o convite no Instagram
   (Configurações → Apps e sites → Convites de testadores). **Não precisa de Página do Facebook.**
3. Gerar o token da conta com as permissões `instagram_business_basic`, `instagram_business_manage_comments` e `instagram_business_manage_messages`.
4. Secrets do repositório (Settings → Secrets and variables → Actions):
   - `INSTAGRAM_TOKEN` = o token
   - `INSTAGRAM_USER_ID` = o ID da conta
5. Aba Actions → "Robô do EU QUERO" → Run workflow (testa na hora).

## Atenção
- App em **modo de desenvolvimento** só recebe comentários/mensagens de quem tem função no app. Para o público, o app precisa do
  **acesso avançado** (revisão da Meta) em `instagram_business_manage_comments` e `instagram_business_manage_messages`.
- O token vence em 60 dias: renove (`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=TOKEN`) e atualize o Secret.
- Desligue as automações "EU QUERO" do ManyChat quando o robô estiver valendo, senão a pessoa recebe o link duas vezes.
- Para mudar o link ou as palavras: edite `LINK_DO_PLANO` e `PALAVRAS` em `.github/workflows/eu-quero.yml`.
- Para parar: aba Actions → Robô do EU QUERO → menu "..." → Disable workflow.

## Testes
`npm test`
