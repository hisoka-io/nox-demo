FROM node:22-slim

RUN npm install -g pnpm@10 serve

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

CMD serve dist -s -l tcp://0.0.0.0:${PORT:-3000}
