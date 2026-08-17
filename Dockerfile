FROM node:18-alpine

WORKDIR /app

# 从 server 子目录复制 package.json 和依赖
COPY WeChatDeloy/server/package*.json ./
RUN npm ci --only=production

# 复制 server 源码
COPY WeChatDeloy/server/src/ ./src/

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "src/index.js"]