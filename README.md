# WhatsApp AI Bot 🤖

Add Gemini AI as a real participant in any WhatsApp group. Mention it by name and it replies like a regular user — with context, memory, and multiple response modes.

```
Alice: @Gemini what should we cook for dinner tonight?
Gemini: How about pasta carbonara? It's quick, uses ingredients you likely
        have, and everyone usually loves it. Want the recipe?
Bob: yes please!
Alice: @Gemini give us the recipe
Gemini: [full recipe with steps...]
```

---

## Features

- Responds when **@mentioned** or when the word `gemini` appears in a message
- **Per-group memory** — remembers the last 20 messages for context
- **4 response modes** — Normal, Brief, Detailed, Fun (per group)
- **Typing indicator** — shows "typing..." while generating a response
- **Quoted replies** — replies directly to the triggering message
- **Commands** — `help`, `status`, `mode`
- **Auto-reconnect** — recovers from disconnections automatically
- **Debug mode** — run with `--debug` flag for verbose logging

---

## Prerequisites

Before starting, make sure you have:

1. **Node.js v18 or higher** — [nodejs.org](https://nodejs.org) (download the LTS version)
2. **A Gemini API key** — free, from Google AI Studio (instructions below)
3. **A dedicated phone number for the bot** — this becomes the "AI contact" you add to groups

---

## Step 1 — Get a Gemini API Key

The bot uses Google's Gemini AI (free tier: 1,500 requests/day).

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click **"Get API key"** in the top-left menu
4. Click **"Create API key in new project"**
   > Important: choose **"new project"** — existing projects with billing enabled may have the free tier disabled
5. Copy the key (looks like `AIzaSyABCDEF...`)

---

## Step 2 — Set Up a WhatsApp Account for the Bot

The bot needs its own dedicated WhatsApp account (a separate phone number). This is the contact your family/friends will see and @mention in groups.

### Getting a phone number

You need a number that can **receive an SMS** for WhatsApp verification. Options:

| Option | Cost | Notes |
|--------|------|-------|
| **eSIM with calls/text** (Airalo, etc.) | ~$5 one-time | Works worldwide, no extra phone needed |
| **Cheap local prepaid SIM** | ~$5–10 | Most reliable |
| **Google Voice** | Free | US only |
| **SMS-Activate / 5sim** | ~$0.50 | Virtual number, one-time use |

### Registering WhatsApp on an existing phone (recommended)

Modern Android and iPhone support **two WhatsApp accounts on one phone**:

1. Install WhatsApp normally (if not already installed)
2. Open WhatsApp → tap your profile icon → **"Add account"**
3. Register with the new number, verify via SMS
4. The bot account is now on your phone alongside your personal account

> **Note:** You only need the phone to scan the QR code once during setup.
> After that the bot runs independently on your computer.

---

## Step 3 — Install the Bot

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/whatsapp-ai-bot.git
cd whatsapp-ai-bot

# 2. Install dependencies
npm install

# 3. Create your config file
cp .env.example .env
```

Open `.env` and fill in your Gemini API key:

```env
GEMINI_API_KEY=AIzaSyABCDEF123456789xyz
```

---

## Step 4 — Run & Connect to WhatsApp

```bash
npm start
```

The bot will generate a QR code image at `qr.png` in the project folder.

1. **Open `qr.png`** — double-click it to open in your image viewer
2. **On the bot's WhatsApp account** (the dedicated number):
   - Go to **Settings → Linked Devices → Link a Device**
   - Scan the QR code
3. The terminal will show:
   ```
   ✓ Connected to WhatsApp!
   ✓ @mention the bot in any group to trigger it.
   ```

> The QR code expires after ~60 seconds. If it expires, just restart with `npm start` and a new one is generated.
> After the first scan, the session is saved in `auth_session/` — you won't need to scan again on restart.

---

## Step 5 — Add to Groups & Start Chatting

1. On your **personal WhatsApp**, save the bot's number as a contact (e.g. "Gemini AI")
2. Open any group chat → Add participants → add "Gemini AI"
3. Send a message:

```
@Gemini tell me a joke
```

or simply:

```
gemini what's the weather like?
```

---

## Bot Commands

All commands are triggered by @mentioning the bot followed by the command:

| Command | Description |
|---------|-------------|
| `@gemini help` | Show all commands and current mode |
| `@gemini status` | Show uptime, messages handled, memory usage |
| `@gemini mode normal` | Conversational, 1–3 sentences *(default)* |
| `@gemini mode brief` | One sentence answers only |
| `@gemini mode detailed` | Thorough answers with bullet points |
| `@gemini mode fun` | Playful, casual, with emojis 🎉 |

Each group has its own independent mode.

---

## Configuration

All configuration is done via the `.env` file:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Your Google Gemini API key |

---

## Debug Mode

Run with the `--debug` flag to see detailed logs for every message received:

```bash
npm start -- --debug
```

Useful for troubleshooting mention detection or trigger issues.

---

## Troubleshooting

### Bot doesn't respond
- Make sure the message contains `gemini` or uses @mention
- Run with `--debug` to see exactly what the bot receives
- Check the terminal for any error messages

### "Gemini is unavailable" error
- Your API key may be invalid or from a project with billing issues
- Create a new key at [aistudio.google.com](https://aistudio.google.com) using **"Create API key in new project"**
- Make sure to use model `gemini-2.5-flash` (older models may not be available)

### QR code expired before scanning
- Restart the bot: `npm start`
- A fresh `qr.png` will be generated immediately

### Bot disconnected / logged out
```bash
# Delete the saved session and reconnect
rm -rf auth_session
npm start
# Scan the new QR code
```

### Session keeps disconnecting
- Keep the bot's WhatsApp account active on a phone (don't remove it)
- WhatsApp may terminate sessions that appear inactive

---

## Project Structure

```
whatsapp-ai-bot/
├── src/
│   └── index.js        # Main bot logic
├── auth_session/        # WhatsApp session (auto-created, gitignored)
├── qr.png              # QR code for linking (auto-generated)
├── .env                # Your config (gitignored)
├── .env.example        # Config template
├── .gitignore
└── package.json
```

---

## Important Notes

**WhatsApp Terms of Service:** This bot uses [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial WhatsApp Web library. Using unofficial clients may violate WhatsApp's Terms of Service. Use a dedicated phone number — not your personal number — to avoid any risk to your main account. This project is intended for personal use only.

**API Costs:** The Gemini API free tier provides 1,500 requests/day and 15 requests/minute — sufficient for personal group chat use. Monitor your usage at [console.cloud.google.com](https://console.cloud.google.com).

---

## License

MIT

---

*Built with [Claude Code](https://claude.ai/claude-code) by Anthropic.*
