// ============================================================
// LUMI BOT — Grupo LumiNex
// ============================================================
// Quatro peças trabalhando juntas:
// 1. Baileys: conecta esse código ao SEU WhatsApp (via QR Code),
//    exatamente como o WhatsApp Web faz.
// 2. Groq (Whisper): transcreve áudios recebidos em texto — de graça,
//    dentro do limite gratuito.
// 3. Anthropic SDK: manda o texto (digitado OU transcrito) pro Claude,
//    junto com a personalidade do Lumi, e recebe a resposta.
// 4. Telegram: manda alertas e o QR Code pra você, e mantém um
//    servidor HTTP vivo (exigência do Render pra não "dormir").
// ============================================================

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import Anthropic from '@anthropic-ai/sdk';
import pino from 'pino';
import { SYSTEM_PROMPT } from './lumi-persona.js';

// Cliente da Anthropic — usa a chave que você vai colocar no arquivo .env
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Memória de conversa, EM RAM (na memória do processo, não salva em
// disco). Isso significa: se o bot reiniciar, esquece as conversas
// em andamento. Pra um primeiro teste está ótimo; se quiser memória
// permanente depois, dá pra trocar por um banco de dados (etapa futura).
const conversationHistory = new Map();

// Guarda só as últimas N mensagens por conversa, pra não gastar
// tokens (e dinheiro) demais mandando o histórico inteiro toda hora.
const MAX_HISTORY = 20;

// ============================================================
// FASE 5 — PROTEÇÃO DE CUSTO E USO
// ============================================================

// NÍVEL 8: preço REAL do Claude Haiku 4.5 (setembro/2026):
// $1 por milhão de tokens de ENTRADA, $5 por milhão de SAÍDA.
// Dividimos por 1 milhão pra ter o preço "por token", que é a
// unidade que o response.usage devolve depois de cada chamada.
const PRICE_PER_INPUT_TOKEN = 1 / 1_000_000;
const PRICE_PER_OUTPUT_TOKEN = 5 / 1_000_000;

// Configuráveis pelo .env, com um valor padrão caso não seja definido.
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || '1.00');
const MAX_MESSAGES_PER_HOUR = parseInt(process.env.MAX_MESSAGES_PER_HOUR || '15', 10);

// Estado do "cofre": quanto já foi gasto hoje, e quando foi o
// último reset (pra zerar automaticamente à meia-noite).
let dailySpend = 0;
let lastResetDate = new Date().toDateString();
let budgetAlertSentToday = false; // evita mandar o mesmo alerta repetidas vezes no mesmo dia

// Histórico de horários de mensagem por pessoa, pra calcular o
// rate limit — Map de "número" → lista de timestamps (em ms).
const messageTimestamps = new Map();

// Reseta o gasto do dia se a data mudou desde a última mensagem.
function resetDailySpendIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    console.log(`🔄 Novo dia — resetando gasto (ontem: $${dailySpend.toFixed(4)})`);
    dailySpend = 0;
    lastResetDate = today;
    budgetAlertSentToday = false;
  }
}

// Verifica se essa pessoa já mandou mensagem demais na última hora.
// Retorna true se PODE continuar, false se estourou o limite.
function checkRateLimit(from) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  const timestamps = messageTimestamps.get(from) || [];
  // Mantém só os horários da última hora (descarta os mais antigos)
  const recentTimestamps = timestamps.filter((t) => t > oneHourAgo);

  recentTimestamps.push(now);
  messageTimestamps.set(from, recentTimestamps);

  return recentTimestamps.length <= MAX_MESSAGES_PER_HOUR;
}

// ============================================================
// FASE 4 — SUPORTE A MENSAGENS DE ÁUDIO
// ============================================================

// NÍVEL 8: Claude não "escuta" áudio diretamente pela API — só lê
// texto, imagem e PDF. Por isso usamos um serviço à parte (Groq,
// rodando o Whisper) só pra transformar áudio em texto. Depois que
// vira texto, o resto do fluxo é EXATAMENTE igual a uma mensagem
// digitada — o Claude nem sabe que aquilo começou como áudio.
async function transcribeAudio(buffer) {
  // FormData e Blob já vêm prontos no Node 18+, sem precisar instalar nada.
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), 'audio.ogg');
  formData.append('model', 'whisper-large-v3-turbo'); // versão rápida, dentro do plano gratuito
  formData.append('language', 'pt'); // já avisamos que é português, acelera e melhora a precisão

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq respondeu ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text.trim();
}

// ============================================================
// FASE 1 (parte 2) — ALERTAS E SERVIDOR HTTP PRO RENDER
// ============================================================

// NÍVEL 9: por que Telegram e não WhatsApp pros alertas? Porque se
// a conexão do WhatsApp cair, é EXATAMENTE aí que você mais precisa
// ser avisado — mas o bot não consegue mandar mensagem pelo canal
// que está caído. O Telegram é um canal INDEPENDENTE: continua de
// pé mesmo com o WhatsApp fora do ar.

// Pequena pausa — usada entre tentativas de reenvio.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// NÍVEL 10: retry com backoff — em vez de desistir na primeira falha
// de rede (comum logo na inicialização de um servidor gratuito, que
// às vezes ainda não tem a rede 100% pronta nos primeiros segundos),
// tentamos de novo até 3 vezes, esperando um pouco mais a cada
// tentativa (1s, depois 3s) — dá tempo da rede "acordar" de vez.
async function withRetry(fn, label, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await fn();
      return; // deu certo, não precisa tentar de novo
    } catch (err) {
      const isLast = i === attempts;
      console.error(`⚠️ Tentativa ${i}/${attempts} falhou (${label}): ${err.message}${err.cause ? ' — causa: ' + err.cause : ''}`);
      if (!isLast) await sleep(i * 2000); // 2s, depois 4s
    }
  }
}

async function sendTelegramAlert(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  await withRetry(async () => {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
    });
    if (!res.ok) throw new Error(`Telegram respondeu ${res.status}`);
  }, 'alerta Telegram');
}

// Manda o QR Code como IMAGEM direto no seu Telegram — essencial
// quando o bot está rodando num servidor remoto (Render), onde você
// não tem uma tela pra ver o arquivo qr.png diretamente.
async function sendTelegramQR(filePath, caption) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  await withRetry(async () => {
    const fileBuffer = await readFile(filePath);
    const form = new FormData();
    form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
    form.append('caption', caption);
    form.append('photo', new Blob([fileBuffer]), 'qr.png');

    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`Telegram respondeu ${res.status}`);
  }, 'QR Code Telegram');
}

// NÍVEL 9: o Render (no plano gratuito) exige que o processo "escute"
// uma porta HTTP — é assim que ele sabe que o serviço está vivo.
// Nosso bot não PRECISA de um site, então essa resposta é só um
// "oi, tô vivo" pra satisfazer essa exigência. O UptimeRobot vai
// bater nessa mesma porta de tempos em tempos pra evitar que o
// Render coloque o processo pra dormir por inatividade.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Lumi está de pé e funcionando! 🤖✨');
  })
  .listen(PORT, () => {
    console.log(`🌐 Servidor HTTP ouvindo na porta ${PORT} (mantém o Render feliz)`);
  });

async function startBot() {
  // useMultiFileAuthState salva a "sessão" numa pasta local (auth_info/).
  // Depois do primeiro login (escanear o QR), o bot reconecta sozinho
  // sem pedir escaneamento de novo — até você deletar essa pasta ou
  // desconectar manualmente pelo celular.
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    // Desliga os logs internos bem verbosos do Baileys; deixamos só
    // os nossos console.log próprios, mais fáceis de acompanhar.
    logger: pino({ level: 'silent' }),
  });

  // --- Evento de conexão: aqui aparece o QR Code e o status ---
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escaneie esse QR Code no WhatsApp > Aparelhos conectados:\n');
      qrcodeTerminal.generate(qr, { small: true });

      // NÍVEL 7: além do QR no terminal (que às vezes fica pequeno
      // ou cortado dependendo do tamanho da janela), também salvamos
      // como um arquivo de imagem de verdade — muito mais fácil de
      // abrir em tela cheia e escanear sem erro.
      QRCode.toFile('qr.png', qr, { width: 500 }, async (err) => {
        if (!err) {
          console.log('🖼️  Também salvei como imagem: abra o arquivo qr.png e escaneie ele em tela cheia.\n');
          // No servidor (Render), não tem como abrir esse arquivo
          // direto — por isso mandamos ele pro seu Telegram também.
          await sendTelegramQR('qr.png', '📱 O Lumi precisa reconectar! Escaneie esse QR Code no WhatsApp > Aparelhos conectados.');
        }
      });
    }

    if (connection === 'close') {
      // Verifica o motivo da desconexão. Se NÃO foi um logout manual
      // (você desconectando pelo celular), o bot tenta reconectar sozinho.
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Conexão fechada.', shouldReconnect ? 'Reconectando...' : 'Você fez logout — rode o script de novo pra reconectar.');
      sendTelegramAlert(
        shouldReconnect
          ? '⚠️ Lumi perdeu a conexão com o WhatsApp. Tentando reconectar sozinho...'
          : '🔴 Lumi foi desconectado (logout manual). Ele NÃO vai reconectar sozinho — rode o bot de novo e escaneie um novo QR Code.'
      );
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Lumi conectado ao WhatsApp! Aguardando mensagens...\n');
      sendTelegramAlert('✅ Lumi está conectado e funcionando normalmente!');
    }
  });

  // Sempre que as credenciais mudam (ex: primeira conexão), salva
  // no disco pra não precisar escanear o QR de novo depois.
  sock.ev.on('creds.update', saveCreds);

  // --- Evento de mensagem recebida: aqui mora o "cérebro" ---
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];

    // Ignora mensagens vazias e mensagens que O PRÓPRIO BOT enviou
    // (senão ele ficaria "respondendo a si mesmo" infinitamente).
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const isAudio = !!msg.message.audioMessage;

    if (isAudio) {
      if (!process.env.GROQ_API_KEY) {
        console.log(`🎤 Áudio recebido de ${from}, mas GROQ_API_KEY não está configurada — ignorando.`);
        await sock.sendMessage(from, { text: 'Ainda não consigo ouvir áudios 🙏 Pode mandar em texto?' });
        return;
      }
      console.log(`🎤 Áudio recebido de ${from}, transcrevendo...`);
      try {
        // downloadMediaMessage baixa o arquivo de áudio criptografado
        // do WhatsApp e devolve já descriptografado, pronto pra usar.
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        text = await transcribeAudio(buffer);
        console.log(`📝 Transcrição: "${text}"`);
      } catch (err) {
        console.error('⚠️ Erro ao transcrever áudio:', err.message);
        await sock.sendMessage(from, { text: 'Não consegui entender esse áudio 😕 Pode tentar de novo, ou em texto?' });
        return;
      }
    }

    if (!text) return; // ignora figurinha, imagem sem legenda etc (por enquanto)

    console.log(`📩 Mensagem de ${from}${isAudio ? ' (via áudio)' : ''}: ${text}`);

    resetDailySpendIfNewDay();

    // --- Proteção 1: limite de mensagens por pessoa ---
    if (!checkRateLimit(from)) {
      console.log(`🚫 ${from} atingiu o limite de ${MAX_MESSAGES_PER_HOUR} mensagens/hora — ignorando (sem chamar a IA, sem custo).`);
      await sock.sendMessage(from, {
        text: 'Você mandou bastante mensagem em pouco tempo! Me dá uns minutinhos e volta a conversar 🙂',
      });
      return; // sai ANTES de gastar um único token
    }

    // --- Proteção 2: teto de gasto diário ---
    if (dailySpend >= DAILY_BUDGET_USD) {
      console.log(`🚫 Orçamento diário estourado ($${dailySpend.toFixed(4)} / $${DAILY_BUDGET_USD}) — resposta padrão, sem chamar a IA.`);
      if (!budgetAlertSentToday) {
        budgetAlertSentToday = true;
        sendTelegramAlert(`🚫 O orçamento diário do Lumi ($${DAILY_BUDGET_USD}) estourou! Ele vai responder só com mensagem padrão até amanhã. Se quiser liberar mais hoje, aumente DAILY_BUDGET_USD no .env e reinicie.`);
      }
      await sock.sendMessage(from, {
        text: 'Nosso atendimento automático está com alta demanda no momento! Em breve alguém da equipe te responde por aqui 🙏',
      });
      return;
    }

    // Recupera (ou cria) o histórico dessa conversa específica
    const history = conversationHistory.get(from) || [];
    history.push({ role: 'user', content: text });

    try {
      // Mostra "digitando..." no WhatsApp do cliente, pra parecer
      // mais natural (não é instantâneo feito robô).
      await sock.sendPresenceUpdate('composing', from);

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // modelo rápido e barato, ideal pra chat
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: history,
      });

      const reply = response.content[0].text;

      // Calcula o custo REAL dessa chamada específica, usando os
      // números que a própria API devolve (quantos tokens ela
      // realmente processou), não uma estimativa.
      const { input_tokens, output_tokens } = response.usage;
      const callCost = (input_tokens * PRICE_PER_INPUT_TOKEN) + (output_tokens * PRICE_PER_OUTPUT_TOKEN);
      dailySpend += callCost;

      console.log(`💰 Custo dessa mensagem: $${callCost.toFixed(5)} | Total hoje: $${dailySpend.toFixed(4)} / $${DAILY_BUDGET_USD}`);

      // Guarda a resposta no histórico e mantém só as últimas mensagens
      history.push({ role: 'assistant', content: reply });
      conversationHistory.set(from, history.slice(-MAX_HISTORY));

      await sock.sendMessage(from, { text: reply });
      console.log(`🤖 Lumi respondeu: ${reply}\n`);
    } catch (err) {
      console.error('⚠️ Erro ao chamar a IA:', err.message);
      sendTelegramAlert(`⚠️ Erro ao chamar a IA pra responder ${from}:\n${err.message}`);
      await sock.sendMessage(from, {
        text: 'Desculpa, tive um probleminha técnico agora 🙏 Pode repetir sua mensagem?',
      });
    }
  });
}

startBot();
// Espera alguns segundos antes do primeiro alerta — dá tempo da
// rede do servidor "acordar" de vez em quando frio (cold start),
// que foi a causa provável do "fetch failed" que vimos no Render.
setTimeout(() => {
  sendTelegramAlert('🚀 Lumi bot foi iniciado e está de pé!');
}, 5000);
