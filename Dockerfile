FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
CMD ["bash", "docker-entrypoint.sh"]
