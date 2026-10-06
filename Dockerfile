FROM node:22-slim

RUN npm install -g pnpm@10 serve

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_NOX_SEED_URL
ARG VITE_NOX_RPC_URL
ARG VITE_NOX_REGISTRY_ADDRESS
ARG VITE_ANON_RPC_SPECIFIER
ARG VITE_ANON_RPC_CHAIN_ID
ARG VITE_ANON_RPC_SPECIFIER_RPC
ARG VITE_ANON_RPC_TARGET
RUN pnpm build

CMD serve dist -s -l tcp://0.0.0.0:${PORT:-3000}
