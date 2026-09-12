# Imagem do bot autónomo do LisDiscord — corre server/index.ts sem Electron
# nem interface nenhuma, pensada para ficar sempre ligada num servidor
# (ver docs/deploy-oracle.md). A app desktop continua a existir à parte,
# para quem preferir gerir tudo a partir do computador.

FROM node:20-alpine

WORKDIR /app

# Só o package.json muda com pouca frequência — copiar primeiro aproveita a
# cache do Docker e evita reinstalar tudo a cada alteração de código.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY electron ./electron
COPY shared ./shared
COPY server ./server
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV LISDISCORD_DATA_DIR=/app/data
VOLUME ["/app/data"]

CMD ["npx", "tsx", "server/index.ts"]
