# Lumi Bot — Grupo LumiNex

Bot de WhatsApp com IA de verdade, sem mensalidade de API paga
(usa Baileys, que é gratuito). O único custo é o uso da IA
(Claude), que já está pago com os créditos da sua conta Anthropic.

## Pré-requisitos

- Node.js instalado no notebook (versão 18 ou mais recente).
  Pra conferir, abra o terminal e digite: `node -v`
  Se não tiver instalado: https://nodejs.org (baixe a versão "LTS")
- Uma conta na Anthropic com créditos: https://console.anthropic.com

## Passo a passo

### 1. Instalar as dependências

Abra o terminal DENTRO da pasta do projeto e rode:

```
npm install
```

Isso baixa tudo que o projeto precisa (Baileys, SDK da Anthropic, etc).
Vai demorar um minuto ou dois.

### 2. Configurar sua chave da IA

1. Copie o arquivo `.env.example` e renomeie a cópia para `.env`
2. Abra o `.env` e cole sua chave da Anthropic no lugar de
   `sk-ant-sua-chave-aqui`
3. Pra pegar sua chave: entre em https://console.anthropic.com/settings/keys
   → "Create Key" → copie o valor gerado (ele só aparece uma vez!)

### 3. Rodar o bot

```
npm start
```

Um QR Code vai aparecer DENTRO DO PRÓPRIO TERMINAL (feito de
quadradinhos ASCII). No seu celular:

1. Abra o WhatsApp Business
2. Toque nos 3 pontinhos > Aparelhos conectados > Conectar um aparelho
3. Aponte a câmera pro QR Code que apareceu no terminal

Depois de escanear, deve aparecer no terminal:
`✅ Lumi conectado ao WhatsApp! Aguardando mensagens...`

Pronto — a partir de agora, qualquer mensagem que chegar no seu
WhatsApp vai ser respondida automaticamente pelo Lumi.

### 4. Testar

Manda uma mensagem de outro número (ou peça pra alguém mandar)
pro seu WhatsApp conectado. Acompanhe o terminal: ele mostra
tanto a mensagem recebida quanto a resposta do Lumi, em tempo real.

## Importante

- **Mantenha o terminal aberto.** Assim que você fechar, o bot para
  de funcionar (isso é esperado — mais pra frente, quando quiser
  deixar rodando 24h sem depender do notebook ligado, migramos pra
  um servidor de verdade).
- **Não delete a pasta `auth_info/`** depois de conectar — é ela
  que guarda sua sessão, pra não precisar escanear o QR toda vez
  que você reiniciar o bot.
- **A pasta `node_modules/` não vai nesse ZIP** — ela é gerada
  pelo `npm install`, por isso o primeiro passo é sempre rodar
  esse comando.

## Próximos passos (quando estiver pronto)

- Colocar esse bot rodando 24h num servidor (não depender do
  notebook ligado)
- Dar memória permanente às conversas (hoje reinicia zerado)
- Conectar com um sistema de agenda/CRM
