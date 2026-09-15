FROM node:22-alpine

WORKDIR /app

COPY ingestion/package.json ingestion/package-lock.json ./
RUN npm ci --omit=dev

COPY ingestion/src ./src
COPY adapters ./adapters

CMD ["node", "src/index.js"]
