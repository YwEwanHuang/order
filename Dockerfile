FROM node:18-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --only=production

COPY server/src/ ./src/

ENV PORT=80
ENV NODE_ENV=production

EXPOSE 80

CMD ["node", "src/index.js"]