FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY dashboard/package.json ./
RUN npm install

COPY dashboard/ .

EXPOSE 5173
CMD ["npm", "run", "dev"]
