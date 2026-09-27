FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY bot.js data.js ./

CMD ["node", "bot.js"]