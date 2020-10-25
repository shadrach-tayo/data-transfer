
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
const log = console.log;

class Events {
  static fire(type, data) {
    return window.dispatchEvent(new CustomEvent(type, { detail: data }));
  }

  static on(type, callback) {
    // console.log("listen to ", type);
    return window.addEventListener(type, callback, false);
  }
}

class FileDigester {
  constructor(meta, callback) {
    this._meta = meta;
    this._name = meta.name;
    this._size = meta.size;
    this._type = meta.mime || "application/octet-stream";
    this._buffer = [];
    this._bytesReceived = 0;
    this.progress = 0;
    this._callback = callback;
  }

  unchunk(chunk) {
    log("Chunk ", chunk);
    this._buffer.push(chunk);
    this._bytesReceived += chunk.byteLength || chunk.size;

    this.progress = this._bytesReceived / this.size;

    if (this._bytesReceived < this._size) return; // tranfer note complete

    let blob = new Blob(this._buffer, { name: this._name, type: this._type });

    this._callback({ ...this._meta, blob });
    // package and send file to callback if totalChunk == size;
  }
}

const { RTCPeerConnection, RTCSessionDescription } = window;
const log$1 = console.log;

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

class RTCPeer {
  constructor(peerId, server) {
    this.peerId = peerId;
    this.server = server;
    this._fileQueue = [];
    this._busy = false;
  }

  sendFiles(files) {
    log$1("files ", files.length);
    for (let i = 0; i < files.length; i++) {
      this._fileQueue.push(files[i]);
    }
    if (this._busy) return;
    this._deQueueFile();
  }

  _deQueueFile() {
    log$1("dequeue file -----------------", this._fileQueue.length);
    if (!this._fileQueue.length) return;
    this._busy = true;
    let file = this._fileQueue.shift();
    this.sendFile(file);
  }

  _sendJson(data) {
    this._send(JSON.stringify(data));
  }

  sendText(text) {
    this._sendJson({type: 'text', text});
  }

  sendFile(file) {
    // send file header
    const header = {
      type: "file-header",
      name: file.name,
      size: file.size,
      mime: file.type,
    };
    this._sendJson(header);
    // create fileDigester to handle new files
    // send message to indicate success full tranfer
    // track progress
    
    let reader = new FileReader();
    reader.onload = (e) => {
      log$1("RTC: ", e.target.result);
      this._send(e.target.result);
    };
    reader.readAsArrayBuffer(file);
  }

  sendSignal(message) {
    message.to = this.peerId;
    message.type = "signal";
    this.server.send(message);
  }

  _onFileHeader(data) {
    // create new fileDigester to handle current data transfer
    console.log("file header ", data);
    this._fileDigester = new FileDigester(
      {
        name: data.name,
        mime: data.mime,
        size: data.size,
      },
      (proxyFile) => this._onFileReceived(proxyFile)
    );
  }

  _onChunkReceived(chunk) {
    // send chunk to filedigester
    if (this._fileDigester) {
      this._fileDigester.unchunk(chunk);
    }
  }

  _onTransferComplete() {
    this._busy = false;
    this._deQueueFile();
    // set progress to 1
    // remove file chunker if any
    // do necessary clean up
  }

  _onFileReceived(proxyFile) {
    log$1("file-received ", proxyFile);
    Events.fire("file-received", proxyFile);
    this._sendJson({ type: "tranfer-complete" });
    // publish file received event for download dialog to initiate download
  }

  _onMessage(message) {
    log$1("Received data  ", typeof message);
    // handle object type data
    if (typeof message != "string") {
      return this._onChunkReceived(message);
    }

    log$1("parse ", message);
    let data = JSON.parse(message);
    // handle string type data
    switch (data.type) {
      // handle progress
      case "progress":
        break;
      // handle fileHeader
      case "file-header":
        this._onFileHeader(data);
        break;
      // handle tranfer complete
      case "tranfer-complete":
        this._onTransferComplete();
    }
  }
}

class PeerConnection extends RTCPeer {
  constructor(server, peerId) {
    super(peerId, server);
    // this.stream = stream;
    this.config = RTC_Config;    
    if (!peerId) return;
    this._connect(this.peerId, true);
  }

  _connect(peerId, isCaller) {
    if (!this.peerConnection) this._openConnection(peerId, isCaller);
    // this.listenToPeerEvents();
    if (isCaller) {
      this._openChannel();
    } else {
      this.peerConnection.ondatachannel = (e) => this._onDataChannel(e);
    }
  }

  _openConnection(peerId, isCaller) {
    this.peerId = peerId;
    this.peerConnection = new RTCPeerConnection(this.config);
    this.peerConnection.onicecandidate = (e) => this.onIceCandidate(e);
    this.peerConnection.onconnectionstatechange = (e) =>
      this.onConnectionStateChange();
    this.peerConnection.oniceconnectionstatechange = (e) =>
      this.onIceConnectionStateChange();
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
      .catch((err) => log$1("error ", err));
  }

  _channelOpened(e) {
    // handle channel opened
    log$1("RTC: channel opened ", e);
    this.channel = e.channel || e.target;
    this.channel.onmessage = (e) => this._onMessage(e.data);
    this.channel.onerror = this._onChannelClosed;
  }

  _onDataChannel(e) {
    // handle channel opened
    log$1("RTC: channel event ", e);
    this.channel = e.channel || e.target;
    this.channel.onmessage = (e) => this._onMessage(e.data);
    this.channel.onerror = this._onChannelClosed;
  }

  _send(message) {
    if (!this.channel) this.refresh();
    log$1("send ", message);
    this.channel.send(message);
  }

  onConnectionStateChange(evt) {
    log$1(
      "Connection state changed ",
      this.peerId,
      this.peerConnection.connectionState
    );

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
    console.log("sdp ", desc);
    this.peerConnection
      .setLocalDescription(new RTCSessionDescription(desc))
      .then((_) => {
        // console.log('description ', desc)
        this.sendSignal({ sdp: desc });
      })
      .catch((e) => this.onError(e));
  }

  onIceConnectionStateChange(evt) {
    console.log(
      "ice connection state changed ",
      this.peerConnection.iceConnectionState
    );
  }

  onIceCandidate(evt) {
    if (!evt.candidate) return;
    console.log("ice ", evt.candidate);
    this.sendSignal({ ice: evt.candidate });
  }

  onServerMessage(data) {
    log$1("WS: ", data);
    if (!this.peerConnection) this._connect(data.sender, false);

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
    this._connect(this.peerId, this.isCaller); // reconnect channel
  }

  onError(err) {
    log$1("error ", err);
  }

  refresh() {
    if (this.channel && this.channel.readystate === "open") return;
    if (this.channel && this.channel.readystate === "connection") return;
    this._connect(this.peerId, this.isCaller);
  }

  listenToPeerEvents() {
    this.peerConnection.onicegatheringstatechange = (evt) => {
      log$1("ICE Candidate gathering state ", evt);
    };

    this.peerConnection.onsignalingstatechange = (evt) => {
      log$1("signaling state changed ", evt, this.peerConnection);
    };
  }

  createAnswer(evt) {
    this.peerConnection
      .createAnswer()
      .then((answer) => {
        log$1("sending answer ", answer);
        // send answer to remote peer
        this.sendSignal(answer);

        // set offer description
        this.peerConnection.setLocalDescription(answer);
      })
      .catch((err) => log$1("error creating answer ", err));
  }

  handleAnswer(data) {
    this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  }

  addIceCandidate(data) {
    log$1("ICE Candidate received - ", data.candidate);
    this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  close() {
    this.peerConnection.close();
  }
}

const log$2 = console.log;
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
      log$2(" socket connection error ", error);
    });

    this.socket.on("close", this.onDisconnect);

    this.socket.on("disconnect", (evt) => {
      log$2(" socket disconnected ", !this.socket.connected);
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
      case "peers":
        Events.fire("peers", message);
        break;
      case "peer-left":
        // log("peer-left ", message);
        Events.fire("peer-left", message);
        break;
      case "peer-joined":
        // log("peer-joined ", message.peer);
        Events.fire("peer-joined", message.peer);
        break;
      case "signal":
        // log("Signal", message.type);
        Events.fire("signal", message);
        break;
    }
  }

  send(message) {
    console.log("send", message.type, message.to);
    this.socket.send(message);
  }

  cleanUp() {
    log$2("clean up task ", this.peerConnection);
    this.socket.close();
  }

  onDisconnect() {
    log$2(" socket disconnected ", !this.socket.connected);
  }

  disconnect() {
    log$2("disconnect ", this.socket, this.peerConnection);
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }

  onVisibilityChange() {
    // console.log("visibilty change ", document.hidden);
    if (document.hidden) return;
  }
}

class PeerUI {
  constructor(peer) {
    console.log("---- peer ", peer);
    this._peer = peer;
    this.initUI();
    this.bindListeners(this.$el);
  }

  html() {
    return `
      <label class="column center">
        <input type="file" multiple />
        <div class="icon-container">
          <svg class="icon">
            <use xlink:href="#desktop-mac" />
          </svg>
        </div>
        <div class="peer-name"></div>
      </label>`;
  }

  initUI() {
    const el = document.createElement("div");
    el.classList.add("peer");
    el.id = this._peer.id;
    el.innerHTML = this.html();
    el.querySelector("svg use").setAttribute("xlink:href", this._icon());
    el.querySelector(".peer-name").textContent = this._peer.displayName;
    this.$el = el;
  }

  bindListeners(el) {
    el.querySelector("input").addEventListener("change", (e) =>
      this._onFileSelected(e)
    );
    //  el.addEventListener("drop", (e) => this._onDrop(e));
    //  el.addEventListener("dragend", (e) => this._onDragEnd(e));
    //  el.addEventListener("dragleave", (e) => this._onDragEnd(e));
    //  el.addEventListener("dragover", (e) => this._onDragOver(e));
    //  el.addEventListener("contextmenu", (e) => this._onRightClick(e));
    //  el.addEventListener("touchstart", (e) => this._onTouchStart(e));
    //  el.addEventListener("touchend", (e) => this._onTouchEnd(e));
  }

  _icon() {
    // assign an icon based on the device type
    return "#desktop-mac";
  }

  _onFileSelected(e) {
    const input = e.target;
    const files = e.target.files;
    Events.fire("files-selected", {
      files: files,
      to: this._peer.id,
    });
    input.value = null;
  }
}

class PeersManager {
  constructor(serverConnection) {
    this.peers = {};
    this.server = serverConnection;
    Events.on("signal", (evt) => this._onSignal(evt.detail));
    Events.on("peers", (evt) => this._onPeers(evt.detail));
    Events.on("files-selected", (evt) => this._onFileSelected(evt.detail));
    Events.on("peer-left", (evt) => this._onPeerLeft(evt.detail));
    Events.on("send-text", (evt) => this._onSendText(evt.detail));
  }

  _onPeers(data) {
    let peers = data.peers;

    peers.forEach((peer) => {
      if (this.peers[peer.id]) {
        // handle existing peers
        this.peers[peer.id].refresh();
        return;
      } else {
        this.peers[peer.id] = new PeerConnection(this.server, peer.id);
        // Events.fire('peer-joined', peer);
        // handle browsers that don't support RTCPeer
      }
    });
  }

  _onSignal(message) {
    // console.log('capture signal ', message);
    if (!message.sender) return;

    if (!this.peers[message.sender]) {
      this.peers[message.sender] = new PeerConnection(this.server);
    }
    this.peers[message.sender].onServerMessage(message);
  }

  _onFileSelected(message) {
    // console.log("files-selected ", message);
    log$2("file selected ", message.to, this.peers[message.to]);
    // TODO: handle cases where peer isn't found
    this.peers[message.to].sendFiles(message.files);
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

class PeersUI {
  constructor() {
    this.$el = document.getElementById("peers");
    Events.on("peers", (e) => this.onPeersJoined(e.detail));
    Events.on("peer-left", (e) => this.onPeerLeft(e.detail));
    Events.on("peer-joined", (e) => this.onPeerJoined(e.detail));
    Events.on("paste", (e) => this.onPaste(e.detail));
    Events.on("file-progress", (e) => this.onFileProgress(e.detail));
  }

  onPeersJoined(data) {
    this.clearPeers();
    data.peers.forEach((peer) => {
      this.onPeerJoined(peer);
    });
  }

  onPeerJoined(peer) {
    if (document.getElementById(peer.id)) return;
    let peerUI = new PeerUI(peer);
    this.$el.appendChild(peerUI.$el);
  }

  onPeerLeft(data) {
    const peer = document.getElementById(data.peerId);
    if (peer) {
      this.$el.removeChild(peer);
    }
  }

  onPaste(e) {}
  onFileProgress(e) {}

  clearPeers() {
    this.$el.childNodes.forEach((child) => {
      log$2("clear child ", child);
      child.remove();
    });
  }
}

class Application {
  constructor() {
    this.server = new Server();
    this.peersManager = new PeersManager(this.server);
    this.peersUI = new PeersUI();
    console.log("app initialized");
  }
}

// Initialize application
const app = new Application();

/**
 * Todo:
 * 4. implement a FileChunker and a FileDigester to ease file transfer between peers
 */
