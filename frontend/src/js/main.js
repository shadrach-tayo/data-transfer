import { PeerConnection } from "./peerConnection";
import { Events } from "./utils";
import { ReceiveFileDialog, ReceiveTextDialog, SendTextDialog } from "./ui";

const log = console.log;
const webSocketConnectionURL = "SOCKET_URL";

const CALL_STATES = {
  ACCEPTED: "accepted",
  INCOMING: "incoming",
  OUTGOING: "outgoing",
};

function getUserLocalMedia(cameraConfig) {
  console.log("config ", cameraConfig);
  return new Promise((resolve, reject) => {
    navigator.getWebCam =
      navigator.getUserMedia ||
      navigator.webKitGetUserMedia ||
      navigator.moxGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    if (navigator.getWebCam) {
      navigator.getUserMedia(cameraConfig, resolve, reject);
    } else {
      navigator.mediaDevices.getUserMedia(cameraConfig).then(resolve, reject);
    }
  });

  // function getMediaSuccess(stream) {}
}

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
      log(" socket connection error ", error);
    });

    this.socket.on("close", this.onDisconnect);

    this.socket.on("disconnect", (evt) => {
      log(" socket disconnected ", !this.socket.connected);
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
      default:
        break;
    }
  }

  send(message) {
    console.log("send", message.type, message.to);
    this.socket.send(message);
  }

  cleanUp() {
    log("clean up task ", this.peerConnection);
    this.socket.close();
  }

  onDisconnect() {
    log(" socket disconnected ", !this.socket.connected);
  }

  disconnect() {
    log("disconnect ", this.socket, this.peerConnection);
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
    log("file selected ", message.to, this.peers[message.to]);
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
      log("clear child ", child);
      child.remove();
    });
  }
}

class Application {
  constructor() {
    this.server = new Server();
    this.peersManager = new PeersManager(this.server);
    this.peersUI = new PeersUI();
    this.receiveFileDialog = new ReceiveFileDialog();
    // this.receiveTextDialog = new ReceiveTextDialog();
    // this.receiveTextDialog = new SendTextDialog();
    log("app initialized ");
  }
}

// Initialize application
const app = new Application();

/**
 * Todo:
 * 1. Implement text sending
 * 2. debug break in data transfer
 * 4. implement a FileChunker and a FileDigester to ease file transfer between peers
 */
