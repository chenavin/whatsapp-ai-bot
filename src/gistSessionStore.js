const https = require('https');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

function githubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'whatsapp-ai-bot',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function fetchStore() {
  try {
    const gist = await githubRequest('GET', `/gists/${GIST_ID}`);
    const file = gist.files?.['session.json'];
    if (!file) return {};
    return JSON.parse(file.content, BufferJSON.reviver);
  } catch (e) {
    console.log('Gist fetch error:', e.message);
    return {};
  }
}

async function persistStore(store) {
  try {
    await githubRequest('PATCH', `/gists/${GIST_ID}`, {
      files: { 'session.json': { content: JSON.stringify(store, BufferJSON.replacer) } },
    });
  } catch (e) {
    console.log('Gist save error:', e.message);
  }
}

async function useGistAuthState() {
  const store = await fetchStore();
  console.log(`✓ Gist session loaded (${Object.keys(store).length} keys)`);

  const creds = store['creds'] || initAuthCreds();

  // Debounce saves — batch rapid key updates into one Gist write
  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistStore(store), 2000);
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) data[id] = store[`${type}:${id}`] ?? null;
          return data;
        },
        set: async (data) => {
          for (const [type, values] of Object.entries(data)) {
            for (const [id, value] of Object.entries(values)) {
              const key = `${type}:${id}`;
              if (value != null) store[key] = value;
              else delete store[key];
            }
          }
          scheduleSave();
        },
      },
    },
    saveCreds: async () => {
      store['creds'] = creds;
      await persistStore(store);
    },
  };
}

module.exports = { useGistAuthState };
