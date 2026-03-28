/**
 * One-time script to get a Google OAuth2 refresh token for Drive uploads.
 *
 * Prerequisites:
 *   1. Go to Google Cloud Console > APIs & Services > Credentials
 *   2. Create an OAuth 2.0 Client ID (type: Web Application)
 *   3. Add http://localhost:3333 as an Authorized Redirect URI
 *   4. Copy the Client ID and Client Secret
 *
 * Usage:
 *   node scripts/get-refresh-token.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * It will open a browser window. Log in with the Google account whose Drive
 * you want photos stored in, and approve access. The script prints the
 * refresh token to paste into your .env.local and Vercel env vars.
 */

const http = require("http");
const { google } = require("googleapis");
const { exec } = require("child_process");

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Usage: node scripts/get-refresh-token.js <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:3333";
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

// Start a temporary local server to catch the OAuth callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:3333`);
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h1>Error: no authorization code received</h1>");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h1>Success!</h1>
      <p>You can close this window. Check the terminal for your refresh token.</p>
    `);

    console.log("\n========================================");
    console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
    console.log("========================================\n");
    console.log("Add this to your .env.local and Vercel environment variables.");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end("<h1>Error exchanging code for tokens</h1><p>" + err.message + "</p>");
    console.error("Token exchange failed:", err.message);
  } finally {
    server.close();
  }
});

server.listen(3333, () => {
  console.log("Opening browser for Google authorization...\n");
  // Open browser cross-platform
  const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  exec(`${cmd} "${authUrl}"`);
  console.log("If the browser didn't open, go to:\n" + authUrl + "\n");
});
