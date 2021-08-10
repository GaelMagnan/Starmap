FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

RUN npm ci --only=production


COPY . .

ENV PORT 8080
ENV ENV_FROM_ENVJS  "remoteDev"
ENV AUTH_REDIR_FROM_ENVJS "remoteDev"

RUN echo "export const ENV_FROM_ENVJS = '$ENV_FROM_ENVJS';\nexport const AUTH_REDIR_FROM_ENVJS = '$AUTH_REDIR_FROM_ENVJS';" >> ./public/js/env.js

EXPOSE $PORT
CMD [ "node", "index.js"]
