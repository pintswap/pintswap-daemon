FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
CMD ["sh", "docker-entrypoint.sh"]
