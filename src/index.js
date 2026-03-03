require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const QRCode = require('qrcode');
const path = require('path');
const http = require('http');
const fs = require('fs');
const pino = require('pino');

// ── QR web server (needed for cloud deployment) ───────
const PORT = process.env.PORT || 3000;
const qrPath = path.join(__dirname, '..', 'qr.png');

http.createServer((req, res) => {
  if (fs.existsSync(qrPath)) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    fs.createReadStream(qrPath).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>✓ Bot is connected to WhatsApp</h1><p>No QR code needed — already linked.</p>');
  }
}).listen(PORT, () => console.log(`Server on port ${PORT}`));

// ── Gemini setup ──────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// ── Modes ─────────────────────────────────────────────
const MODES = {
  normal: {
    label: 'Normal',
    description: 'Conversational, 1-3 sentences (default)',
    instruction: 'You are an AI assistant in a WhatsApp group chat. Be conversational, helpful and concise (1-3 sentences). Be friendly and natural.',
  },
  brief: {
    label: 'Brief',
    description: 'One sentence answers only',
    instruction: 'You are an AI assistant in a WhatsApp group chat. Answer in ONE sentence maximum. Be extremely concise.',
  },
  detailed: {
    label: 'Detailed',
    description: 'Thorough answers with structure',
    instruction: 'You are an AI assistant in a WhatsApp group chat. Give thorough and complete answers. Use bullet points or numbered lists when helpful. Do not truncate your response.',
  },
  fun: {
    label: 'Fun 🎉',
    description: 'Playful, casual and uses emojis',
    instruction: 'You are a fun and playful AI assistant in a WhatsApp group chat. Use casual language, humor, and emojis. Keep it light and entertaining.',
  },
};

const HELP_MESSAGE = `*Gemini Bot Commands* 🤖

*Modes:*
@gemini mode normal — ${MODES.normal.description}
@gemini mode brief — ${MODES.brief.description}
@gemini mode detailed — ${MODES.detailed.description}
@gemini mode fun — ${MODES.fun.description}

@gemini status — Show bot status & session stats
@gemini help — Show this message

_Just @mention or write "gemini" to ask anything._`;

// Per-group mode (defaults to normal)
const groupModes = new Map();

const startTime = Date.now();
let totalMessages = 0;

function formatUptime() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const DEBUG = process.argv.includes('--debug');
const debug = (...args) => { if (DEBUG) console.log('[DEBUG]', ...args); };

let botJid = null;
let botLid = null;

// ── Per-group chat history (in-memory) ───────────────
const histories = new Map();

function addToHistory(groupId, sender, text) {
  if (!histories.has(groupId)) histories.set(groupId, []);
  const h = histories.get(groupId);
  h.push({ sender, text });
  if (h.length > 20) h.shift();
}

async function askGemini(groupId, senderName, text) {
  const mode = MODES[groupModes.get(groupId)] || MODES.normal;
  const h = histories.get(groupId) || [];
  const context = h.map(m => `${m.sender}: ${m.text}`).join('\n');
  const prompt = context
    ? `Group chat history:\n${context}\n\nRespond to the latest message.`
    : `${senderName}: ${text}`;
  const result = await model.generateContent({
    systemInstruction: mode.instruction,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return result.response.text().trim();
}

// ── WhatsApp connection ───────────────────────────────
async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Connection state ────────────────────────────────
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      await QRCode.toFile(qrPath, qr, { width: 400, margin: 2 });
      console.log('─────────────────────────────────────────');
      console.log('  Scan the QR code to connect WhatsApp:');
      console.log(`  Local:  ${qrPath}`);
      console.log(`  Cloud:  visit your deployment URL`);
      console.log('  Settings → Linked Devices → Link a Device');
      console.log('─────────────────────────────────────────\n');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('\nLogged out. Delete the auth_session folder and restart.');
      } else {
        console.log(`Connection closed (code ${code}), reconnecting...`);
        connect();
      }
    }

    if (connection === 'open') {
      botJid = sock.user.id;
      botLid = sock.user.lid || '';
      const botNumber = botJid.split(':')[0].split('@')[0];
      const botLidNumber = botLid.split(':')[0].split('@')[0];
      if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath); // remove QR after connect
      console.log('\n✓ Connected to WhatsApp!');
      console.log(`✓ Bot JID: ${botNumber} | LID: ${botLidNumber}`);
      console.log('✓ @mention the bot in any group to trigger it.\n');
    }
  });

  // ── Incoming messages ───────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;

      // Groups only
      const groupId = msg.key.remoteJid;
      if (!groupId?.endsWith('@g.us')) continue;

      // Extract message text
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        ''
      ).trim();

      if (!text) continue;

      // Auto-read every group message → clears phone notification
      await sock.readMessages([msg.key]);

      // Trigger on @mention (by JID) or by name as fallback
      const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const botNumber = botJid?.split(':')[0].split('@')[0];
      let botLidNumber = botLid?.split(':')[0].split('@')[0];
      const isNamedInText = text.toLowerCase().includes('gemini');

      // Learn our LID if unknown — when text trigger + single @lid mention are used together
      if (!botLidNumber && isNamedInText) {
        const lidJids = mentionedJids.filter(j => j.endsWith('@lid'));
        if (lidJids.length === 1) {
          botLid = lidJids[0];
          botLidNumber = botLid.split(':')[0].split('@')[0];
          console.log(`✓ Learned bot LID: ${botLidNumber}`);
        }
      }

      const isMentioned = mentionedJids.some(jid => {
        const n = jid.split(':')[0].split('@')[0];
        return n === botNumber || (botLidNumber && n === botLidNumber);
      });

      debug(`text="${text}"`);
      debug(`mentionedJids=${JSON.stringify(mentionedJids)}`);
      debug(`botJid=${botJid} botNumber=${botNumber}`);
      debug(`isMentioned=${isMentioned} isNamedInText=${isNamedInText}`);

      if (!isMentioned && !isNamedInText) continue;

      const senderName = msg.pushName || msg.key.participant?.split('@')[0] || 'Someone';
      const cleanText = text.replace(/@\S+/g, '').trim().toLowerCase();
      console.log(`[${new Date().toLocaleTimeString()}] ${senderName}: ${text}`);

      // ── Commands ──────────────────────────────────────
      if (cleanText === 'status') {
        const mode = MODES[groupModes.get(groupId)] || MODES.normal;
        const history = histories.get(groupId) || [];
        await sock.sendMessage(groupId, { text:
`*Gemini Bot Status* 🤖

⏱ *Uptime:* ${formatUptime()}
💬 *Mode:* ${mode.label} — ${mode.description}
📨 *Messages this session:* ${totalMessages}
🧠 *Memory (this group):* ${history.length}/20 messages
🔮 *Model:* gemini-2.5-flash

_Note: API quota can only be checked at console.cloud.google.com_`
        }, { quoted: msg });
        continue;
      }

      if (cleanText === 'help') {
        const currentMode = MODES[groupModes.get(groupId)] || MODES.normal;
        await sock.sendMessage(groupId, {
          text: HELP_MESSAGE + `\n\n_Current mode: *${currentMode.label}*_`,
        }, { quoted: msg });
        continue;
      }

      const modeMatch = cleanText.match(/^mode\s+(\w+)$/);
      if (modeMatch) {
        const requested = modeMatch[1];
        if (MODES[requested]) {
          groupModes.set(groupId, requested);
          await sock.sendMessage(groupId, {
            text: `✓ Switched to *${MODES[requested].label}* mode — ${MODES[requested].description}`,
          }, { quoted: msg });
        } else {
          await sock.sendMessage(groupId, {
            text: `Unknown mode "${requested}". Available: ${Object.keys(MODES).join(', ')}`,
          }, { quoted: msg });
        }
        continue;
      }

      // ── Normal AI response ────────────────────────────
      addToHistory(groupId, senderName, text);

      try {
        await sock.sendPresenceUpdate('composing', groupId);
        const reply = await askGemini(groupId, senderName, text);
        addToHistory(groupId, 'Gemini', reply);
        await sock.sendMessage(groupId, { text: reply }, { quoted: msg });
        await sock.sendPresenceUpdate('paused', groupId);
        totalMessages++;
        console.log(`[${new Date().toLocaleTimeString()}] Bot replied: ${reply.slice(0, 80)}${reply.length > 80 ? '…' : ''}`);
      } catch (err) {
        console.error('Error:', err.message);
        await sock.sendPresenceUpdate('paused', groupId);
      }
    }
  });
}

connect();
