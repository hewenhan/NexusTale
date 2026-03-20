import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
import { createServer } from "http";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // --- OAuth Routes ---

  // 1. Get Auth URL
  app.get('/api/auth/url', (_req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    
    if (!clientId) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured" });
    }

    const scope = [
      'https://www.googleapis.com/auth/drive.file', // View and manage Google Drive files and folders that you have opened or created with this app
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scope,
      access_type: 'offline', // To get refresh token
      prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url: authUrl });
  });

  // 2. Callback Handler
  app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.APP_URL}/auth/callback`;

    if (!code || !clientId || !clientSecret) {
      return res.status(400).send("Missing code or configuration");
    }

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        throw new Error(tokens.error_description || tokens.error);
      }

      // Send tokens back to opener via postMessage
      const html = `
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_SUCCESS', 
                  payload: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                document.body.innerText = "Authentication successful. You can close this window.";
              }
            </script>
            <p>Authentication successful. Closing...</p>
          </body>
        </html>
      `;
      res.send(html);

    } catch (error) {
      console.error("Token exchange error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // 3. Refresh Token Endpoint
  app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!refresh_token || !clientId || !clientSecret) {
      return res.status(400).json({ error: "Missing refresh token or configuration" });
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      res.json(data);
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

  // --- End OAuth Routes ---

  // --- Grok Image Proxy ---
  // xAI SDK 是 Node.js 专用，浏览器端直接调用会被 CORS 拦截
  // 通过后端代理，用 SDK 生成图片后返回 base64 给前端
  app.post('/api/grok/image', async (req, res) => {
    const { prompt, model, aspectRatio } = req.body;
    if (!prompt || !model) {
      return res.status(400).json({ error: 'Missing prompt or model' });
    }
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROK_API_KEY not configured' });
    }
    try {
      const { createXai } = await import('@ai-sdk/xai');
      const { generateImage } = await import('ai');
      const xai = createXai({ apiKey });
      const { image } = await generateImage({
        model: xai.image(model),
        prompt,
        ...(aspectRatio ? { aspectRatio } : {}),
        // ...(size ? { size } : {}),
      });
      if (image.base64) {
        res.json({ base64: image.base64 });
      } else {
        res.json({ error: 'No image generated' });
      }
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('safety') || msg.includes('policy') || msg.includes('content')) {
        return res.json({ prohibited: true });
      }
      console.error('Grok image proxy error:', e);
      res.status(500).json({ error: e?.message || 'Grok image generation failed' });
    }
  });

  // --- End Grok Image Proxy ---

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving would go here (not needed for this dev environment context usually, but good practice)
    app.use(express.static('dist'));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
