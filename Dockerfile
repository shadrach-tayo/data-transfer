FROM node:alpine

WORKDIR /usr/app

COPY package*.json ./
RUN npm install

COPY . ./

RUN npm run build:prod

EXPOSE 8000

CMD [ "npm", "start" ]