
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
const { RTCPeerConnection, RTCSessionDescription } = window;
const log = console.log;

const turnServerIPAddress = "3.81.63.29";
const turnServerPort = "3478";
const turnServerUserName = "shadrachtayo";
const turnServerPassword = "shadrach19";

const RTC_Config = {
  iceServers: [
    {
      urls: [`stun:${turnServerIPAddress}:${turnServerPort}?transport=tcp`],
    },
    {
      urls: [`turn:${turnServerIPAddress}:${turnServerPort}?transport=tcp`],
      username: turnServerUserName,
      credential: turnServerPassword,
    },
  ],
};


class PeerConnection {
  constructor(peerId, server) {
    this.peerId = peerId;
    this.server = server;
    // this.stream = stream;
    this.config = RTC_Config;
    this.existingTracks = [];
    console.log("new peer ", peerId);
    this._connect(this.peerId, true);
  }

  _connect(peerId, isCaller) {
    this.peerId = peerId;
    this.peerConnection = new RTCPeerConnection(this.config);
    this.peerConnection.onicecandidate = e => this.onIceCandidate(e);
    this.peerConnection.onconnectionstatechange = e => this.onConnectionStateChange();
    this.peerConnection.oniceconnectionstatechange = e => this.onIceConnectionStateChange();

    // this.listenToPeerEvents();
    if (isCaller) {
      this._openChannel();
    } else {
      this.peerConnection.ondatachannel = (e) => this._channelOpened(e);
    }
  }

  _openChannel() {
    const channel = this.peerConnection.createDataChannel("data-channel", {
      reliable: true,
    });
    channel.binaryType = "arraybuffer";
    channel.onopen = (e) => this._channelOpened(e);
    this.peerConnection
      .createOffer()
      .then((offer) => this._onDescription(offer))
      .catch((err) => log("error ", err));
  }

  _channelOpened(e) {
    // handle channel opened
    this.channel = e.channel || e.target;
    this.channel.onmessage = this._onMessage;
    this.channel.onerror = this._onChannelClosed;
  }

  onConnectionStateChange(evt) {
    log("Connection state changed ", this.peerId, this.peerConnection.connectionState);
    
    switch (this.peerConnection.connectionState) {
      case "disconnected":
        this._onChannelClosed();
        break;
      case "failed":
        this.peerConnection = null;
        this._onChannelClosed();
        break;
    }
  }

  _onDescription(desc) {
    // console.log('new des ', desc)
    this.peerConnection
      .setLocalDescription(new RTCSessionDescription(desc))
      .then(_ => {
        // console.log('description ', desc)
        this.sendSignal({ sdp: desc });
      })
      .catch((e) => this.onError(e));
  }

  onIceConnectionStateChange(evt) {
    console.log("ice connection state changed");
  }

  onIceCandidate(evt) {
    if (!evt.candidate) return;
    // console.log('ice ', evt);
    this.sendSignal({ ice: evt.candidate });
  }

  sendSignal(message) {
    message.to = this.peerId;
    message.type = "signal";
    this.server.send(message);
  }

  _onMessage(evt) {
    log("Received data  ", evt.data);
  }

  onServerMessage(data) {
    // log("server message ", data.type);
    if (!this.peerConnection) this.refresh();

    if (data.sdp) {
      this.peerConnection
        .setRemoteDescription(new RTCSessionDescription(data.sdp))
        .then((_) => {
          if (data.sdp.type === "offer") {
            this.peerConnection
              .createAnswer()
              .then((answer) => this._onDescription(answer));
          }
        })
        .catch((err) => this.onError(err));
    } else if (data.ice) {
      this.peerConnection.addIceCandidate(new RTCIceCandidate(data.ice));
    }
  }

  _onChannelClosed(e) {
    if (!this.isCaller) return;
    this._connect(); // reconnect channel
  }

  onError(err) {
    log("error ", err);
  }

  refresh() {
    if (this.channel || this.channel.readystate === "open") return;
    if (this.channel || this.channel.readystate === "connection") return;
    this.connect();
  }

  listenToPeerEvents() {
    this.peerConnection.onicegatheringstatechange = (evt) => {
      log("ICE Candidate gathering state ", evt);
    };

    this.peerConnection.onsignalingstatechange = (evt) => {
      log("signaling state changed ", evt, this.peerConnection);
    };
  }

  createAnswer(evt) {
    this.peerConnection
      .createAnswer()
      .then((answer) => {
        log("sending answer ", answer);
        // send answer to remote peer
        this.sendSignal(answer);

        // set offer description
        this.peerConnection.setLocalDescription(answer);
      })
      .catch((err) => log("error creating answer ", err));
  }

  handleAnswer(data) {
    this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  }

  addIceCandidate(data) {
    log("ICE Candidate received - ", data.candidate);
    this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  close() {
    this.peerConnection.close();
  }
}

const log$1 = console.log;
const webSocketConnectionURL = "wss://localhost:8000";

function setLocalId(id) {
  // document.getElementById("localId").textContent = id;
}

function setLocalName(name) {
  document.getElementById("peerName").textContent = name;
}

class Server {
  constructor() {
    this.displayVideo = true;
    this.displayAudio = true;
    this.cameraConfig = {
      video: true,
      audio: true,
    };

    this.reconnectTimer = null;

    Events.on("beforeunload", (e) => this.disconnect());
    Events.on("pagehide", (e) => this.disconnect());
    document.addEventListener("visibilitychange", (e) =>
      this.onVisibilityChange()
    );

    this.initializeSocketAndStream();
  }

  initializeSocketAndStream() {
    try {
      this.connectToWebSocket();      
    } catch (e) {
      console.log("Couldn\t connect to web sockets");
    }

    // getUserLocalMedia(this.cameraConfig)
    //   .then((stream) => {
    //     let localVideo = document.getElementById("local-video");
    //     this.localStream = stream;

    //     if (localVideo) {
    //       // localVideo.srcObject = stream;
    //       try {
    //         this.connectToWebSocket();
    //         console.log("app socket ", this.socket);
    //       } catch (e) {
    //         console.log("Couldn\t connect to web sockets");
    //       }
    //     }
    //   })
    //   .catch((error) => {
    //     console.log("error: could not access webcam  ", error);
    //   });
  }

  connectToWebSocket() {
    
    if (this.socket && this.socket.connected === true) return;

    this.socket = io(webSocketConnectionURL);

    this.socket.on("connect", () => {
      console.log("connected... ", this.socket.id);
      setLocalId(this.socket.id);
    });

    this.socket.on("reconnect_attempt", () => {
      console.log(
        "........................reconnect_attempt........................ "
      );
      this.socket.io.opts.transports = ["polling", "websocket"];
    });

    this.socket.on("error", (error) => {
      log$1(" socket connection error ", error);
    });

    this.socket.on("close", this.onDisconnect);

    this.socket.on("disconnect", (evt) => {
      log$1(" socket disconnected ", !this.socket.connected);
      this.onDisconnect();
    });

    this.socket.on("message", this.onMessage);

    this.socket.connect(webSocketConnectionURL);

    return this.socket;
  }

  onMessage(message) {
    // log("incomming server message ", message.type);
    switch (message.type) {
      case "displayName":
        // log("display name ", message.name);
        setLocalName(message.name);
        break;
      case "buddies":
        log$1("buddies ", message.buddies);
        Events.fire('peers', message);
        break;
      case "peer-left":
        log$1("peer-left ", message);
        break;
      case "signal":
        // log("Signal", message.type);
        Events.fire('signal', message);
        break;
      case "offer":
        // add logic for offer
        log$1("peer-offer ", message);
        break;
      case "answer":
        // add logic to handle answer
        log$1("peer answer ", message);
        break;
    }
  }

  send(message) {
    // console.log('send to server', message)
    this.socket.send(message);
  }

  cleanUp() {
    log$1("clean up task ", this.peerConnection);
    this.socket.close();
  }

  onDisconnect() {
    log$1(" socket disconnected ", !this.socket.connected);
  }

  disconnect() {
    log$1("disconnect ", this.socket, this.peerConnection);
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }

  onVisibilityChange() {
    // console.log("visibilty change ", document.hidden);
    if (document.hidden) return;
  }
}

class Events {
  static fire(type, data) {
    return window.dispatchEvent(new CustomEvent(type, { detail: data }));
  }

  static on(type, callback) {
    // console.log("listen to ", type);
    return window.addEventListener(type, callback, false);
  }
}

class PeersManager {
  constructor(serverConnection) {
    this.peers = {};
    this.server = serverConnection;
    Events.on("signal", (evt) => this._onSignal(evt.detail));
    Events.on("peers", (evt) => this._onPeers(evt.detail));
    Events.on("file-selected", (evt) => this._onFileSelected(evt.detail));
    Events.on("peer-left", (evt) => this._onPeerLeft(evt.detail));
    Events.on("send-text", (evt) => this._onSendText(evt.detail));
  }

  _onPeers(data) {
    let peers = data.buddies;
    peers.forEach((peer) => {
      if (this.peers[peer.id]) {
        // handle existing peers
        return;
      } else {
        this.peers[peer.id] = new PeerConnection(peer.id, this.server);
        // handle browsers that don't support RTCPeer
      }
    });
  }

  _onSignal(message) {
    // console.log('capture signal ', message);
    if(!message.sender) return;
    
    if (!this.peers[message.sender]) return;
    this.peers[message.sender].onServerMessage(message);
  }

  _onFileSelected(message) {
    console.log("file-selected ", evt);
    this.peers[message.to].sendFile(message.files);
  }

  _onPeerLeft(message) {
    console.log("peer-left ", message);
    if (!this.peers[message.peerId]) return;
    const peer = this.peers[message.peerId];
    peer.close();
    delete this.peers[message.peerId];
  }

  _onSendText(message) {
    // console.log("send text ", message);
    this.peers[message.to].sendText(message.text);
  }
}

class Application {
  constructor() {
    this.server = new Server();
    this.peersManager = new PeersManager(this.server);
    console.log("app initialized");
  }
}

// Initialize application
const app = new Application();

/**
 * Todo:
 * 1.
 * 2. 
 * 3. create a PeerUI class to handle UI interactions for individual peers
 * 
 * 4. implement a FileChunker and a FileDigester to ease file transfer between peers
 *
 */
