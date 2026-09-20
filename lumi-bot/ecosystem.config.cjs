// ============================================================
// CONFIGURAÇÃO DO PM2 — mantém o Lumi rodando 24h no servidor
// ============================================================
// PM2 é um "gerente de processos": ele roda o index.js em segundo
// plano (mesmo depois que você fecha o terminal/SSH), reinicia
// sozinho se o bot travar, e liga automaticamente se o servidor
// reiniciar. É a peça que faltava pra não depender do notebook ligado.

module.exports = {
  apps: [
    {
      name: 'lumi-bot',
      script: 'index.js',

      // Se o processo cair por qualquer motivo (erro não tratado,
      // queda de rede etc), o PM2 reinicia sozinho.
      autorestart: true,

      // Evita um "loop de reinício infinito": se cair mais de 10
      // vezes em sequência muito rápida, o PM2 para de tentar e te
      // avisa, em vez de ficar reiniciando pra sempre gastando recurso.
      max_restarts: 10,
      min_uptime: '30s',

      // Onde ficam os logs — assim dá pra conferir o histórico de
      // mensagens/erros mesmo depois de fechar a sessão SSH.
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      time: true, // adiciona data/hora em cada linha de log

      // Node.js já suporta ES Modules nativamente (por isso o
      // "type": "module" no package.json) — não precisa de config extra.
    },
  ],
};
