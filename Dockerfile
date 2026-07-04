FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data
ENV DB_FILE=/data/dailies.json
EXPOSE 3000
CMD ["node", "server.js"]
