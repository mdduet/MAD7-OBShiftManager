# Getting Your OAuth Token for Packman API

## Step-by-Step Instructions

### 1. Open Midway SSO Login
Go to: `https://midway-auth.amazon.com/login?reauth=1`

### 2. Click "Sign In"
- Select your preferred authentication method
- Enter your Amazon credentials (mdduet / Barcelona23)

### 3. Complete Security Verification
- Follow the security key verification flow
- You'll authenticate using your security token

### 4. After Successful Authentication
You'll be redirected to a page showing:
- **Authorization Code** (starts with something like `auth_code_...`)
- **Access Token** (a long JWT-like string)
- **Refresh Token** (optional, for long-lived sessions)

### 5. Copy Your Token

The OAuth token will appear in one of these places:

#### Option A: In the URL
Look at the browser address bar after redirect, it might contain:
```
http://redirect-uri/?access_token=eyJhbGc...&token_type=Bearer
```
Copy the value after `access_token=`

#### Option B: On the Page
The token might be displayed on the confirmation page.

#### Option C: In Browser Console
Open Developer Tools (F12) and run:
```javascript
// Get token from page
const token = document.body.innerText;
console.log(token);
```

### 6. Update Your .env File

Once you have the token, edit `.env`:

```env
# Add your OAuth token for direct API calls
OAUTH_ACCESS_TOKEN=<paste-your-token-here>

# Optional: client credentials are not used by the browser flow
OAUTH_CLIENT_ID=mdduet
OAUTH_CLIENT_SECRET=Barcelona23
```

> Note: The browser app currently uses `OAUTH_ACCESS_TOKEN` for live Packman calls. `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` are not sufficient on their own without a proper OAuth token exchange.

⚠️ **NEVER** share this token or commit it to Git!

### 7. Test the Token

Refresh your MAD7 app (`http://localhost:3000`) and run in console:

```javascript
// Get fresh API instance
const api = getPackmanAPI();

// Set your token
api.setTokenDirect('<your-token-here>');

// Test authentication
api.authenticate();

// Fetch floor data
fetchAndUpdateFloor();
```

## Troubleshooting

**Token is invalid/expired:**
- Tokens expire (usually 1 hour)
- Return to Step 1 and get a new token
- Update .env with the fresh token

**Still getting "not authenticated":**
- Check the browser console for error messages
- Make sure token is copied completely (no extra spaces)
- Try without `Bearer` prefix (just the token)

**Getting CORS errors:**
- This means the Packman API is blocking the request
- May need to configure OAuth properly on Packman end
- Contact your Packman API administrator

## Live Testing

After updating `.env`:

1. Hard refresh browser: `Ctrl+Shift+R`
2. Go to **Floor** section
3. Click **"🔄 Refresh Live Data"** button
4. Check console for success/error messages
5. Monitor the Network tab for API requests

👍 If you see floor data updating, you're connected!
