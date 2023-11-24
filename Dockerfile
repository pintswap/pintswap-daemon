FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
CMD ["/bin/bash", "/app/docker-entrypoint.sh"]
