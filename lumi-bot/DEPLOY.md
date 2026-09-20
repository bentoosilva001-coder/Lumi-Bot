# Deploy — Lumi Bot rodando 24h (grátis, para sempre)

Esse guia coloca o bot rodando num servidor de verdade, sem depender
do seu notebook ligado. Usamos a Oracle Cloud porque ela tem um
plano "Always Free" — genuinamente gratuito, sem cartão cobrado nunca.

## Parte 1 — Criar o servidor na Oracle Cloud

1. Crie uma conta em https://www.oracle.com/cloud/free/
   (pede cartão só pra confirmar identidade — não cobra nada no
   plano Always Free)
2. No painel, vá em **Compute > Instances > Create Instance**
3. Escolha a imagem **Ubuntu** (versão mais recente disponível)
4. Em "Shape", escolha uma opção marcada como **"Always Free
   Eligible"** (geralmente VM.Standard.A1.Flex ou E2.1.Micro)
5. Na seção de chave SSH, escolha **"Save private key"** e baixe o
   arquivo (algo como `ssh-key.key`) — guarde ele, é a "senha" de
   acesso ao servidor
6. Clique em **Create**. Espera alguns minutos até o status ficar
   "Running"
7. Anote o **endereço IP público** da instância (aparece na página
   dela)

## Parte 2 — Acessar o servidor (SSH)

No terminal do seu notebook (PowerShell mesmo):

```
ssh -i caminho\para\ssh-key.key ubuntu@SEU_IP_AQUI
```

Na primeira vez, ele pergunta se confia na conexão — digite `yes`.

## Parte 3 — Instalar o Node.js no servidor

Já conectado no servidor (o terminal agora mostra `ubuntu@...` em
vez do seu notebook), rode um comando de cada vez:

```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

## Parte 4 — Instalar o PM2 (o "gerente" que mantém o bot ligado)

```
sudo npm install -g pm2
```

## Parte 5 — Enviar os arquivos do projeto pro servidor

Isso é feito **do seu notebook**, não de dentro do servidor. Abra
OUTRO terminal (deixa o SSH aberto numa aba, abre uma nova aba/janela
pro seu notebook local) e rode, de dentro da pasta do projeto:

```
scp -i caminho\para\ssh-key.key -r . ubuntu@SEU_IP_AQUI:~/lumi-bot
```

Isso copia a pasta inteira (menos `node_modules`, que vamos gerar
direto no servidor).

## Parte 6 — Instalar as dependências no servidor

Volta pra aba com o SSH conectado:

```
cd ~/lumi-bot
npm install
```

## Parte 7 — Configurar o .env no servidor

O arquivo `.env` (com suas chaves) normalmente NÃO vai no `scp`
por segurança. Crie ele direto no servidor:

```
nano .env
```

Cole o conteúdo (mesmas chaves do seu `.env` local), depois
`Ctrl+O` (salvar), Enter, `Ctrl+X` (sair).

## Parte 8 — Rodar o bot com PM2

```
pm2 start ecosystem.config.cjs
```

Pra ver se está rodando:

```
pm2 status
pm2 logs lumi-bot
```

**Vai pedir o QR Code de novo** (sessão nova, nesse servidor) — mas
dessa vez, o `qr.png` vai ser gerado dentro da pasta do projeto NO
SERVIDOR. Pra ver a imagem, baixe ela pro seu notebook:

```
scp -i caminho\para\ssh-key.key ubuntu@SEU_IP_AQUI:~/lumi-bot/qr.png .
```

Abra o arquivo baixado e escaneia normalmente.

## Parte 9 — Deixar ligando sozinho se o servidor reiniciar

```
pm2 startup
```

Ele vai imprimir um comando — copie e cole exatamente esse comando
que ele mostrar, e rode. Depois:

```
pm2 save
```

Pronto — a partir de agora, mesmo que a Oracle reinicie o servidor
(atualização, manutenção), o bot liga sozinho.

## Comandos úteis do dia a dia

| Comando | O que faz |
|---|---|
| `pm2 status` | Mostra se o bot está rodando |
| `pm2 logs lumi-bot` | Mostra o log em tempo real (mensagens, custos, erros) |
| `pm2 restart lumi-bot` | Reinicia o bot manualmente |
| `pm2 stop lumi-bot` | Para o bot |

## Atualizando o código no futuro

Quando eu te passar uma versão nova do `index.js` (ou outro
arquivo), o caminho é:

1. `scp` só o arquivo que mudou pro servidor (mesmo comando da
   Parte 5, mas com o nome do arquivo em vez de `.`)
2. `pm2 restart lumi-bot` pra aplicar a mudança
