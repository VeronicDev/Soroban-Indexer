FROM node:20-alpine

WORKDIR /app

COPY ingestion/package.json ./
RUN npm install --omit=dev

COPY ingestion/src ./src
COPY adapters ./adapters

CMD ["node", "src/index.js"]
