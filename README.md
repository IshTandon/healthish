# HealthIsh

Your honest life audit. Physical · Mental · Emotional · Drain.

## Deploy to your iPhone (free, ~20 minutes)

### Step 1 — Create a GitHub repository
1. Go to github.com → sign in → click the **+** button → **New repository**
2. Name it `healthish`
3. Keep it **Public** (required for free Vercel)
4. Click **Create repository**

### Step 2 — Upload these files to GitHub
On the repository page, click **uploading an existing file** (shown after creation).
Drag and drop ALL files from this folder. Click **Commit changes**.

Alternatively, if you have Git installed, run these commands in this folder:
```
git init
git add .
git commit -m "Initial HealthIsh"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/healthish.git
git push -u origin main
```

### Step 3 — Deploy on Vercel
1. Go to vercel.com → sign up with your GitHub account
2. Click **Add New Project**
3. Find your `healthish` repository → click **Import**
4. Framework Preset will auto-detect as **Vite** — leave everything as default
5. Click **Deploy**
6. Wait ~90 seconds → your app is live at `healthish.vercel.app`

### Step 4 — Install on your iPhone
1. Open Safari on your iPhone
2. Go to your Vercel URL (e.g. `healthish.vercel.app`)
3. Tap the **Share** button (box with arrow pointing up)
4. Scroll down → tap **Add to Home Screen**
5. Tap **Add**

HealthIsh is now on your home screen. Tap it — it opens full screen, no browser bar.

## Local development (optional)
```
npm install
npm run dev
```
Opens at http://localhost:5173
