FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs content.mjs ./
ENV NODE_ENV=production
USER node
EXPOSE 8001
CMD ["node", "server.mjs"]
