# DEPRECATED — 使用仓库根目录的 Dockerfile（端口 80）作为唯一部署入口
# 本文件仅作历史参考，保留用于对比

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "src/index.js"]