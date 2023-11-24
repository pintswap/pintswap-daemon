FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
CMD ["sh", "-c", "/app/docker-entrypoint.sh"]
