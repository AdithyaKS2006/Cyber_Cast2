# CrimeCast Deployment Guide

This project includes automated workflows and infrastructure blueprints to deploy both the **Frontend** and the **Backend** directly from GitHub.

---

## 1. Deploy Frontend to GitHub Pages (Automated via GitHub Actions)

The repository includes a GitHub Actions workflow: [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

### Steps to activate GitHub Pages:
1. Open your repository on GitHub: [https://github.com/AdithyaKS2006/Cyber_Cast2](https://github.com/AdithyaKS2006/Cyber_Cast2)
2. Go to **Settings** → **Pages** (under "Code and automation").
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. Push to `main` or trigger the workflow manually from **Actions** → **Deploy Frontend to GitHub Pages** → **Run workflow**.
5. Your frontend will be live at:
   ```
   https://AdithyaKS2006.github.io/Cyber_Cast2/
   ```

---

## 2. Deploy Full Stack (Frontend + Backend) with 1-Click via Render Blueprint

The repository contains [`render.yaml`](render.yaml) which provisions both services in free tier:
- **`cybercast-backend`**: Python Daphne ASGI server running Django, REST APIs, WebSockets, and ML inference.
- **`cybercast-frontend`**: High-performance static web app with rewrite rules and auto-linked backend API.

### Deploying with Render:
1. Log in to [Render.com](https://render.com).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub repository: `AdithyaKS2006/Cyber_Cast2`.
4. Render will read `render.yaml` and provision both backend and frontend automatically.

---

## 3. GitHub Container Registry (GHCR) Backend Image

The backend is packaged into a production Docker image via [`.github/workflows/deploy-backend-docker.yml`](.github/workflows/deploy-backend-docker.yml).

### Pull & Run Container Anywhere:
```bash
docker pull ghcr.io/adithyaks2006/cyber_cast2/backend:latest
docker run -d -p 8000:8000 ghcr.io/adithyaks2006/cyber_cast2/backend:latest
```

---

## 4. Connecting GitHub Pages Frontend to your Live Backend

Once your backend is deployed (on Render, Railway, or your VPS):
1. In your GitHub repository, go to **Settings** → **Secrets and variables** → **Actions** → **Variables**.
2. Add a new variable:
   - **Name**: `VITE_API_URL`
   - **Value**: Your live backend URL (e.g., `https://cybercast-backend.onrender.com`)
3. Re-run the **Deploy Frontend to GitHub Pages** workflow.
