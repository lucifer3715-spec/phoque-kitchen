# 🐧 阿咩豹私房菜谱 · 自有 Linux 服务器部署指南

你有自己的 Linux 服务器其实**更省心**：不用等 Cloudflare、不用担心海外节点抽风，保存菜谱和照片直接秒存，而且不需要安装任何 npm 第三方依赖，只需要服务器上装有 **Node.js 18+**。

---

## 第 1 步：把项目传到服务器

把电脑上的 `C:\Users\lucif\Documents\ChatGPT\New project\ameibao-recipes` 整个文件夹上传到服务器（比如 `/opt/ameibao-recipes`）。

- 如果你用 **宝塔 / 1Panel 面板**：文件管理里新建 `/opt/ameibao-recipes`，直接打包成 zip 上传并解压即可。
- 如果你用 **Windows PowerShell**：
  ```powershell
  scp -r "C:\Users\lucif\Documents\ChatGPT\New project\ameibao-recipes" root@你的服务器IP:/opt/
  ```

---

## 第 2 步：在服务器上设置密码与配置

SSH 连上服务器后执行：

```bash
cd /opt/ameibao-recipes
cp .env.example .env
nano .env
```

把 `.env` 里的 `KITCHEN_PASSWORD=your-family-passcode` 改成你们自己的家庭密码。

- **如果还没有域名**，先直接通过 `IP:端口` 访问：保持 `HOST=0.0.0.0`、`PORT=8788`（记得在服务器安全组/防火墙放行 `8788` 端口）。
- **如果你有域名准备配 HTTPS**（强烈推荐，iPhone 离线缓存最完整）：`HOST=127.0.0.1` 即可。
- **数据存放**：默认直接保存在服务器 `/opt/ameibao-recipes/kitchen-data/`；如果你想继续用刚才生成的 GitHub Token 同步到私有仓库，把 `.env` 末尾 `GITHUB_TOKEN` 和 `GITHUB_REPO` 两行的 `#` 去掉并填好即可。

---

## 第 3 步：确认 Node.js 并试运行

先看看服务器有没有装 Node.js（需要 v18 或更高）：

```bash
node -v
```

如果提示没有安装 Node.js（以 Ubuntu/Debian 为例）：
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

然后试启动一下：
```bash
cd /opt/ameibao-recipes
node dev-server.mjs
```
看到 `阿咩豹私房菜谱服务已启动` 就成功了！先按 `Ctrl + C` 停下，配置成后台开机自启。

---

## 第 4 步：设置后台常驻运行（开机自启，关掉 SSH 不掉线）

直接运行下面整段命令创建 systemd 服务：

```bash
sudo tee /etc/systemd/system/ameibao.service > /dev/null <<'EOF'
[Unit]
Description=Ameibao Kitchen Recipes Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ameibao-recipes
ExecStart=/usr/bin/node /opt/ameibao-recipes/dev-server.mjs
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ameibao
sudo systemctl status ameibao
```

> 如果 `which node` 不是 `/usr/bin/node`（比如装在 `/usr/local/bin/node`），把上面 `ExecStart=` 里的路径换成 `which node` 查出来的实际路径即可。

---

## 第 5 步：域名 + 免费 HTTPS（给 iPhone 最佳灵动岛 App 体验）

- **如果用宝塔 / 1Panel**：新建一个反向代理网站指向 `http://127.0.0.1:8788`，在面板里点一键申请 Let's Encrypt 免费 SSL 证书并开启强制 HTTPS，**搞定**！
- **如果喜欢极简命令行 Caddy**（全自动续期 HTTPS）：
  安装 Caddy 后，把 `/etc/caddy/Caddyfile` 写成两行：
  ```text
  cook.你的域名.com {
      reverse_proxy 127.0.0.1:8788
  }
  ```
  执行 `sudo systemctl reload caddy`，浏览器打开 `https://cook.你的域名.com` 就上线了！
- **没有域名时**：直接用 iPhone Safari 打开 `http://你的服务器IP:8788`，同样可以点底部分享按钮 ->「添加到主屏幕」，正常记录菜谱、传图和点菜。

---

## 日常数据备份提示

所有菜谱和压缩后的照片都在 `/opt/ameibao-recipes/kitchen-data/`，随时可以在网页右下角「小厨房设置 -> 导出完整 JSON 备份」，或者把 `kitchen-data` 文件夹打包下载一份留底。
