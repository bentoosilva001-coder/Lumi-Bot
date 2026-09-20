# Deploy — Lumi Bot no Render (grátis, sem cartão)

Esse é o caminho SEM cartão de crédito. Diferente da Oracle, aqui
o bot roda num container que pode reiniciar de vez em quando — por
isso montamos o sistema de alertas via Telegram, que te avisa na
hora se precisar de atenção.

## Visão geral do que vamos fazer

1. Criar um bot no Telegram (recebe os alertas e o QR Code)
2. Subir o projeto pro GitHub (o Render publica a partir de lá)
3. Criar a conta no Render e conectar o repositório
4. Configurar as variáveis de ambiente (chaves) direto no painel
5. Configurar o UptimeRobot pra não deixar o bot "dormir"

---

## Parte 1 — Criar o bot no Telegram

1. Abra o Telegram (você já tem instalado) e procure por **@BotFather**
   (é o bot oficial do Telegram pra criar outros bots — tem um selo
   de verificado)
2. Envie `/newbot`
3. Escolha um nome (ex: `Lumi Alertas`)
4. Escolha um username terminando em "bot" (ex: `lumi_luminex_bot`)
5. O BotFather devolve um **token**, algo como
   `1234567890:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxx` — **copie e guarde**,
   é o seu `TELEGRAM_BOT_TOKEN`

### Pegar seu Chat ID

1. No Telegram, procure por **@userinfobot** e inicie uma conversa
   com ele (`/start`)
2. Ele devolve seu **Id** — um número, tipo `123456789` — esse é o
   seu `TELEGRAM_CHAT_ID`
3. **Importante:** também precisa mandar UMA mensagem qualquer pro
   bot que VOCÊ criou (o Lumi Alertas) — procura ele pelo username
   que escolheu e manda um "oi". Sem isso, o bot não tem permissão
   de te mandar mensagem de volta.

---

## Parte 2 — Subir o projeto pro GitHub

Você já sabe fazer isso (fizemos com o site). Dessa vez, como o
projeto tem informação sensível (`.env`), o `.gitignore` já está
configurado pra NUNCA subir esse arquivo — só o código.

1. Crie um novo repositório no GitHub, ex: `lumi-bot`
2. Suba todos os arquivos do projeto (exceto `node_modules`,
   `.env`, `auth_info` — o `.gitignore` já cuida disso se você usar
   git de verdade; se for pelo site, é só não selecionar essas
   pastas/arquivos no upload)

---

## Parte 3 — Criar conta no Render e publicar

1. Acesse https://render.com e clique em **Get Started** — pode
   entrar direto com sua conta do GitHub, não pede cartão
2. No painel, clique em **New +** > **Web Service**
3. Conecte o repositório `lumi-bot` que você acabou de criar
4. Preencha:
   - **Name:** lumi-bot (ou o nome que quiser)
   - **Region:** escolha a mais próxima (Oregon ou similar, já que
     não tem região no Brasil)
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
5. Clique em **Create Web Service**

---

## Parte 4 — Configurar as variáveis de ambiente

Ainda na página do serviço no Render, vá na aba **Environment**.
Adicione cada uma dessas (botão "Add Environment Variable"),
usando os MESMOS valores que estão no seu `.env` local:

| Nome | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | sua chave da Anthropic |
| `GROQ_API_KEY` | sua chave da Groq |
| `TELEGRAM_BOT_TOKEN` | o token do BotFather |
| `TELEGRAM_CHAT_ID` | seu Chat ID |
| `DAILY_BUDGET_USD` | 1.00 (ou o valor que preferir) |
| `MAX_MESSAGES_PER_HOUR` | 15 |

Não precisa adicionar `PORT` — o Render já define ela sozinho.

Depois de salvar, o Render reinicia o serviço automaticamente.

---

## Parte 5 — Pegar o QR Code

Vá na aba **Logs** do serviço no Render, e acompanhe. Quando
aparecer a mensagem sobre o QR Code, **olhe seu Telegram** — o
próprio Lumi Alertas deve ter te mandado a imagem do QR Code
direto no chat. Escaneia normalmente pelo WhatsApp Business.

---

## Parte 6 — Configurar o UptimeRobot (não deixar dormir)

O plano gratuito do Render "dorme" o serviço depois de 15 minutos
sem receber nenhuma requisição HTTP. Vamos usar um monitor gratuito
pra ficar "cutucando" o bot de tempos em tempos.

1. Copie a URL do seu serviço no Render (aparece no topo da página
   dele, algo como `https://lumi-bot-xxxx.onrender.com`)
2. Crie uma conta gratuita em https://uptimerobot.com (não pede
   cartão)
3. Clique em **Add New Monitor**
4. Tipo: **HTTP(s)**
5. Cole a URL do Render
6. Intervalo de checagem: **5 minutos** (o menor disponível no
   plano grátis)
7. Salve

Pronto — o UptimeRobot vai "bater" nessa URL a cada 5 minutos,
o que conta como atividade e impede o Render de colocar o bot
pra dormir.

---

## Sobre o risco de perder a sessão

Se o Render reiniciar o container por qualquer motivo (deploy
novo, manutenção deles), existe uma chance da pasta `auth_info/`
ser resetada — nesse caso, o Lumi vai gerar um QR Code novo
automaticamente, e você recebe ele no Telegram (por isso os
alertas são tão importantes nesse caminho). Não tem uma forma
100% garantida de evitar isso no plano gratuito — é a troca que
fazemos por não pagar nada.

---

## Testando os alertas

Assim que o deploy terminar e o bot conectar, você deve receber
no Telegram:

1. `🚀 Lumi bot foi iniciado e está de pé!`
2. (se pedir novo QR) A imagem do QR Code
3. `✅ Lumi está conectado e funcionando normalmente!`

Se algum desses não chegar, confira se `TELEGRAM_BOT_TOKEN` e
`TELEGRAM_CHAT_ID` estão certos nas variáveis de ambiente do Render,
e se você mandou aquele "oi" inicial pro seu bot (Parte 1).

## Atualizando o código no futuro

Diferente do jeito manual (scp), aqui é mais simples: suba a
mudança pro GitHub (mesmo repositório), e o Render **redeploya
sozinho automaticamente** assim que detecta o novo commit.
