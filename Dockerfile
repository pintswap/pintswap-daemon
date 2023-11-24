FROM node:lts
WORKDIR /app
COPY . .
RUN yarn
CMD ["/bin/bash", "docker-entrypoint.sh"]
