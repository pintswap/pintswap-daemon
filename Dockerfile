FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
CMD ["sh", "/app/docker-entrypoint.sh"]
