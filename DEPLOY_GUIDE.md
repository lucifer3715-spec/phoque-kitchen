# 🦭 阿咩豹私房菜谱 · 免费云端部署指南（Cloudflare Pages + GitHub 私有库）

整套方案 **0 服务器费用**，也不需要租服务器。你的菜谱、成品照、想吃清单全都安全地存放在 **你自己的 GitHub 私有仓库** 里，而 GitHub 访问密钥只保存在 Cloudflare 后台环境变量中，手机和电脑浏览器只需输入你们约定的 **家庭密码** 就能同步。

---

## 准备工作

需要两个免费账号：
1. **GitHub 账号**（用来放菜谱代码和数据）
2. **Cloudflare 账号**（免费托管网站 + 运行云函数，每天 10 万次免费请求）

---

## 第一步：建一个存菜谱数据的 GitHub 私有仓库

1. 登录 GitHub，点击右上角 **+** -> **New repository**。
2. 仓库名填比如 `ameibao-kitchen-data`（可自定义）。
3. 务必勾选 **Private（私有仓库）**，这样别人看不到你的菜谱和照片。
4. 勾选 **Add a README file**（初始化默认 `main` 分支，即使忘记勾选也没关系，小站第一次写菜也会自动帮你初始化）。
5. 点击 **Create repository** 完成创建。

---

## 第二步：生成只能读写这个数据仓库的细粒度 Token

1. 点击 GitHub 右上角头像 -> **Settings**。
2. 左侧菜单拉到最底，点 **Developer settings**。
3. 展开 **Personal access tokens** -> 点击 **Fine-grained tokens** -> **Generate new token**。
4. 填写配置：
   - **Token name**：`ameibao-kitchen-sync`
   - **Expiration**：建议选 **No expiration**（或选 1 年后记得提醒自己更新）
   - **Repository access**：选 **Only select repositories**，在下拉框里只勾选刚才建的 `ameibao-kitchen-data`
   - **Permissions -> Repository permissions**：找到 **Contents**，改成 **Read and write**
5. 点击底部的 **Generate token**，立刻复制保存好生成的那串密钥（页面关掉后就看不到了）。

---

## 第三步：把本网站代码传到 GitHub 并部署到 Cloudflare Pages

> **小建议**：把网站代码放在另一个单独的私有仓库（例如 `ameibao-recipes-app`），数据仓库和程序代码仓库分开，以后备份或换托管更清爽！

### 3.1 上传代码到仓库
将 `ameibao-recipes` 文件夹里的所有文件（注意不要把 `.local-db` 传上去，`.gitignore` 已自动排除）推送到你的代码仓库 `ameibao-recipes-app`（设为 Private 私有即可）：

```bash
cd ameibao-recipes
git init -b main
git add .
git commit -m "init ameibao recipes"
git remote add origin https://github.com/你的用户名/ameibao-recipes-app.git
git push -u origin main
```

### 3.2 连接 Cloudflare Pages
1. 登录 Cloudflare Dashboard。
2. 左侧进入 **Workers & Pages** -> 点击 **Create** -> 切换到 **Pages** 标签页 -> **Connect to Git**。
3. 授权 GitHub 并选择刚才上传代码的仓库 `ameibao-recipes-app`。
4. 构建设置按下面填写（非常关键）：
   - **Project name**：比如 `ameibao-kitchen`（以后网址就是 `https://ameibao-kitchen.pages.dev`）
   - **Production branch**：`main`
   - **Framework preset**：选 **None**
   - **Build command**：**留空不填**
   - **Build output directory**：填 **`public`**
5. 点击 **Save and Deploy**（第一次部署好后还缺环境变量，先别急着打开）。

### 3.3 填写环境变量（核心安全步骤）
1. 回到 Cloudflare Pages 该项目的 **Settings** -> **Environment variables**。
2. 为 **Production**（建议 Preview 也一起填）添加以下变量：

| 变量名 | 填写内容示例 | 说明 |
| :--- | :--- | :--- |
| `KITCHEN_PASSWORD` | `你们自己定的家庭暗号` | 打开小厨房时要输入的密码（建议 8 位以上字母数字组合） |
| `GITHUB_TOKEN` | `刚才复制的细粒度 Token` | 第二步生成的密钥（勾选 **Encrypt** 加密保存） |
| `GITHUB_REPO` | `你的用户名/ameibao-kitchen-data` | 第一步创建的数据仓库（只要写 `用户名/仓库名`） |
| `GITHUB_BRANCH` | `main` | 可选，数据仓库默认分支名（默认就是 `main`） |

3. 填好后，切到 **Deployments** 页面，对最近一次部署点右侧 `...` -> **Retry deployment**，让环境变量生效！

> **国内访问小提示**：Cloudflare Pages 分配的 `*.pages.dev` 域名在部分网络下可能较慢。如果你自己有域名，可以接入 Cloudflare DNS 后在项目 **Custom domains** 里绑定一个自定义二级域名（例如 `cook.你的域名.com`），手机端访问会稳很多。

---

## 第四步：在 iPhone 上添加到主屏幕（灵动岛全屏 App 体验）

1. 用 iPhone 自带的 **Safari 浏览器** 打开你的专属网址。
2. 点击底部工具栏中间的 **分享按钮**（方框带向上箭头）。
3. 往下滑找到 **添加到主屏幕（Add to Home Screen）** -> 确认名称为「阿咩豹菜谱」-> 点右上角 **添加**。
4. 回到手机桌面，点开带阿咩豹头像的独立 App 图标：
   - 全屏无地址栏，顶部冰海蓝天窗延伸到 **灵动岛** 两侧，阿咩豹会在灵动岛正下方探头迎客。
   - 第一次输入你们的家庭密码解锁后，会自动记住登录状态（30 天内免输），并支持离线缓存快速翻看。

---

## 第五步：电脑端日常使用建议

- 直接把网址加入电脑浏览器书签或安装为桌面应用（Edge / Chrome 地址栏右侧点「安装」图标）。
- 电脑上整理那 100 多道记忆中的菜谱时，可以开启右上角 **👨‍🍳 主厨模式**，搭配编辑器里的 **⚡ 快速批量输入** 和 **保存并继续记下一道**，一口气录完超快！
- 平时交给爱人点菜时，关掉主厨模式即可，界面清爽而且完全不怕误点修改菜谱。
