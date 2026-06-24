FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173
ENV DATA_FILE=/app/data/app-state.json

EXPOSE 5173

CMD ["node", "server.js"]
