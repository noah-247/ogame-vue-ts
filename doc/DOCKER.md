# Docker 構建說明

本專案支援兩種 Docker 構建方式：

## 🏠 本地構建

### 方式一：使用構建指令碼（推薦）

**Linux/macOS:**
```bash
chmod +x build-docker.sh
./build-docker.sh
```

**Windows:**
```cmd
build-docker.bat
```

### 方式二：直接使用 Docker 命令

```bash
# 構建映象
docker build -t ogame-vue-ts:local .

# 執行容器
docker run -p 8080:80 ogame-vue-ts:local
```

## ☁️ GitHub Actions 自動構建

當程式碼推送到 `main` 分支或建立 tag 時，GitHub Actions 會自動：

1. 在 Actions 環境中構建專案
2. 使用構建產物建立 Docker 映象
3. 推送到 GitHub Container Registry 和 Docker Hub

### 使用預構建映象

```bash
# 從 GitHub Container Registry 拉取
docker pull ghcr.io/your-username/ogame-vue-ts:latest

# 從 Docker Hub 拉取（如果配置了）
docker pull your-dockerhub-username/ogame-vue-ts:latest

# 執行
docker run -p 8080:80 ghcr.io/your-username/ogame-vue-ts:latest
```

## 📁 檔案說明

- `Dockerfile` - 本地構建用，包含完整的原始碼構建流程
- `Dockerfile.ci` - GitHub Actions 構建用，使用預構建產物
- `.dockerignore` - 本地構建時排除的檔案
- `.dockerignore.ci` - CI 構建時排除的檔案
- `build-docker.sh` / `build-docker.bat` - 本地構建便捷指令碼

## 🔧 配置說明

### GitHub Actions 環境變數

需要在 GitHub 倉庫設定中配置：

**Variables (公開):**
- `DOCKERHUB_USERNAME` - Docker Hub 使用者名稱（可選）

**Secrets (私密):**
- `DOCKERHUB_TOKEN` - Docker Hub 訪問令牌（可選）
- `GITHUB_TOKEN` - 自動提供，用於 GHCR

### 本地構建要求

- Docker
- 足夠的磁碟空間（構建過程中會下載 Node.js 依賴）

## 🚀 快速開始

1. **本地開發測試:**
   ```bash
   ./build-docker.sh
   docker run -p 8080:80 ogame-vue-ts:local
   ```

2. **訪問應用:**
   開啟瀏覽器訪問 `http://localhost:8080`

3. **生產部署:**
   使用 GitHub Actions 自動構建的映象進行部署
