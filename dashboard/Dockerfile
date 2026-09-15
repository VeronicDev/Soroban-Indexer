FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci

COPY dashboard/ .

EXPOSE 5173
CMD ["npm", "run", "dev"]
