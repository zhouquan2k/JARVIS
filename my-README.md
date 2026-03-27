# 启动

- web端开发服务器
pnpm --filter web dev

- server端开发服务器
CHATPRISM_KNOWLEDGE_ROOT=/Users/quanzhou/Workspace/AllAgents \
pnpm run dev:server

- chrome extension build
pnpm --filter extension build
浏览器刷新/重载插件

- desktop
pnpm dev:desktop:renderer

CHATPRISM_KNOWLEDGE_ROOT=/Users/quanzhou/Workspace/AllAgents \
CHATPRISM_LLM_API_KEY=AIzaSyDLs2UnDyhMfvOqsk5EwwGZXL4fo4EIBYU \
CHATPRISM_SYNC_KEY=dev-local \
CHATPRISM_SYNC_BASE_URL=http://127.0.0.1:8787/api/sync \
pnpm --filter desktop dev:host
生产构建 pnpm build:desktop
生产启动 CHATPRISM_SYNC_KEY=your-sync-key \
./node_modules/.bin/electron apps/desktop/dist/main/main/index.js
