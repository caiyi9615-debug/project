# Deadline Hunter：GitHub + Render 上线说明

这是现有 V2.0.1 项目的部署适配，不是新项目；不包含尚未完成的 AI 输出截断修复。

## 1. 上传 GitHub

1. 解压部署 ZIP，打开里面包含 package.json、server.js、render.yaml 的文件夹。
2. 登录 https://github.com/new ，创建仓库，例如 deadline-hunter，建议选择 Private（私有）。
3. 在空仓库页面点击 uploading an existing file（上传已有文件），把上述文件夹里的文件和子文件夹拖进去，提交。
4. 上传后，仓库首页必须直接看见 package.json、server.js、render.yaml 和 public 文件夹。不要只上传 ZIP，也不要再套一层目录。

不要上传 .env、真实密钥、个人任务备份、测试截图或含个人资料的测试结果。
注意：网页手动上传不会依靠 .gitignore 自动过滤文件，必须自己检查。
如果密钥曾经公开或出现在分享截图里，请先在 DeepSeek 控制台撤销，生成新密钥。

## 2. Render 创建网站

1. 登录 https://dashboard.render.com ，选择 New → Web Service（不要选 Static Site）。
2. 连接 GitHub，授权这个仓库，选中它。
3. 填写：

| 项目 | 填写内容 |
| --- | --- |
| Name | deadline-hunter-lubiandui（重名时换一个） |
| Language / Runtime | Node |
| Branch | main（或仓库实际分支） |
| Root Directory | 留空，前提是 package.json 在仓库首页 |
| Build Command | npm install --omit=dev |
| Start Command | npm start |
| Instance Type | Free（仅用于测试或演示） |
| Health Check Path | /api/health |

4. 在 Environment Variables 添加：

| Key | Value |
| --- | --- |
| HOST | 0.0.0.0 |
| NODE_VERSION | 22 |
| NODE_ENV | production |
| DEEPSEEK_MODEL | deepseek-flash |
| DEEPSEEK_API_KEY | 你自己的有效密钥，只填在 Render 后台 |

不要添加本地的 PORT=8790，让 Render 自动分配端口。不要上传 .env。
5. 点击 Deploy Web Service，等状态变成 Live，打开 Render 给出的 https://…onrender.com 网址。
6. 在网页设置里检查 AI 连接，上传一张无隐私的测试截图。若仍提示输出截断，那是现有 AI 解析限制，不是部署成功的证明或失败原因。

可选：使用 New → Blueprint，连接仓库，由根目录 render.yaml 自动填写配置；提示时输入 DEEPSEEK_API_KEY。普通 Web Service 创建方式需要自行填上述字段。

## 3. 上线后注意事项

- 手机、电脑都访问同一个 HTTPS 网址，不需要安装 Node，也不需要访客单独配置 API。
- Render 是服务器，不再需要你的电脑保持开机。
- 免费服务闲置 15 分钟会休眠，下次打开唤醒大约需一分钟，适合演示，不适合依赖及时响应的正式服务。
- 当前没有账户系统或云端任务数据库。任务保存在各自浏览器的 IndexedDB，同一网址的同一浏览器刷新后保留；换设备、浏览器或网址不会自动同步。清除网站数据会丢失本地任务，请定期导出备份。
- 本地 127.0.0.1 的数据不会自动搬到新网址，需要先导出，再在新网址导入。
- 当前 AI 接口没有登录或使用额度控制，任何拿到网址的人都可消耗你的 API 余额；CORS 不是身份验证。不要把演示网址广泛公开，正式开放前应添加身份验证和限流，并设置供应商侧可用的额度限制。
- 密钥不发给浏览器，但服务端会用它请求 DeepSeek。通知和图片会发往 DeepSeek，请勿上传隐私信息。
- 上传 GitHub 后不会自动生成运行中的网址；需要完成 Render 部署。GitHub Pages 不能运行本项目后端。

## 4. 故障排查

- 找不到 package.json：GitHub 多套了一层目录；将 Root Directory 设置为包含 package.json 的目录，或调整上传层级。
- No open ports detected：确认 HOST=0.0.0.0、Start Command=npm start，没有手动设置错误端口。
- 页面正常但 AI 未配置：检查 Render 后台 DEEPSEEK_API_KEY，保存并重新部署，不是在 GitHub 修改 .env。
- 首次打开很慢：可能是免费服务唤醒，等待后刷新。
- AI 截断报错：本次只适配部署，仍需单独修复该解析问题，不能靠换网址消除。

官方说明：https://render.com/docs/web-services 、https://render.com/docs/free
