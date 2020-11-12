# TRANS APP
TransApp is a project inspired by Apple's Air drop and snapdrop.
It uses WebRTC for realtime data/text transfer between two devices on a network

## Extra feature (in progress)
You can also connect to devices not on the network by simply connecting to the peer name through the connect UI

## Technologies
- HTML
- CSS
- Javascript
- WebRTC (no frameworks or library used)
- Websocket
    - [Socket.io](https://socket.io/)
- Nodejs

## INSTALL AND RUN
```sh
$ git clone https://github.com/shadrach-tayo/data-transfer.git

$ npm install

$ npm start
```

## DEPLOY
```sh
$ bash ./deploy.sh 
# builds docker image and push to dockerhub to be deployed on digital ocean or any cloud provider of your choice
```