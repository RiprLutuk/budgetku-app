FROM node:22-slim
WORKDIR /app
COPY . .
ENV PORT=3000 DATA_DIR=/data NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
CMD ["node","server.js"]
