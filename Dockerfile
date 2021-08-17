FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

RUN npm ci --only=production


COPY . .

ARG ENV_FROM_ENVJS
ARG AUTH_REDIR_FROM_ENVJS
ENV PORT 443
ENV ENV_FROM_ENVJS=${ENV_FROM_ENVJS:-"local"}
ENV AUTH_REDIR_FROM_ENVJS=${AUTH_REDIR_FROM_ENVJS:-"local"}

RUN echo "export const ENV_FROM_ENVJS = '$ENV_FROM_ENVJS';\nexport const AUTH_REDIR_FROM_ENVJS = '$AUTH_REDIR_FROM_ENVJS';" >> ./public/js/env.js

EXPOSE $PORT
CMD [ "node", "index.js"]
