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
    this._buffer.push(chunk);
    this._bytesReceived += chunk.byteLength || chunk.size;

    this.progress = this._bytesReceived / this._size;
    log("progress ", this._bytesReceived, this._size);

    if (this._bytesReceived < this._size) return; // tranfer note complete

    let blob = new Blob(this._buffer, { name: this._name, type: this._type });

    this._callback({ ...this._meta, blob });
    // package and send file to callback if totalChunk == size;
  }
}

class FileSender {
  constructor(file, onChunk, callback) {
    this._file = file;
    this._onChunk = onChunk;
    this._callback = callback;
    this.reader = new FileReader();
    this.reader.onload = (e) => this._sendChunk(e.target.result);
    this._maxPacketSize = 1e6;
    this._chunkSize = 64000; // 64 kb
    this._offset = 0;
    this.totalBytesSent = 0;
  }

  _sendChunk(chunk) {
    this._offset += chunk.byteLength; // increment offset
    this._partitionSize += chunk.byteLength;

    this._onChunk(chunk); // send chunk

    if (this.isFileEnd() || this.isPartitionEnd()) {
      // call callback if chunk is finished sending
      this._callback(this._offset);
      return;
    }

    this._readChunk();
  }

  nextPartition() {
    this._partitionSize = 0;
    this._readChunk();
  }

  repeatPartition() {
    this._offset -= this._partitionSize;
    this.nextPartition();
  }

  _readChunk() {
    // write logic to load next chunk from file
    let chunk = this._file.slice(this._offset, this._offset + this._chunkSize);
    this.reader.readAsArrayBuffer(chunk);
  }

  isPartitionEnd() {
    return this._partitionSize >= this._maxPacketSize;
  }

  isFileEnd() {
    return this._offset >= this._file.size;
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
    log$1("files ", files.length, this._busy);
    for (let i = 0; i < files.length; i++) {
      this._fileQueue.push(files[i]);
    }
    if (this._busy) return;
    this._deQueueFile();
  }

  _deQueueFile() {
    if (!this._fileQueue.length) return;
    this._busy = true;
    let file = this._fileQueue.shift();
    this.sendFile(file);
  }

  _sendJson(data) {
    this._send(JSON.stringify(data));
  }

  sendText(text) {
    this._sendJson({ type: "text", text });
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
    log$1("send file ", file);
    // create new fileSender to send files
    this._fileSender = new FileSender(
      file,
      (chunk) => this._send(chunk),
      (offset) => this.onPartitionEnd(offset)
    );
    this._fileSender.nextPartition();
  }

  onPartitionReceived(chunk) {
    this._send(chunk);
  }

  onPartitionEnd(offset) {
    // current file transfer has finished
    log$1("Partition End");
    this._sendJson({ type: "partition", offset });
  }

  nextPartition() {
    // log('next---- ', this._fileSender)
    if (!this._fileSender || this._fileSender.isFileEnd()) return;
    this._fileSender.nextPartition();
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
      this._onDownloadProgress(this._fileDigester.progress);
      // send progress to sender
      if (this._fileDigester.progress <= 0.1) return;
      this.sendProgress(this._fileDigester.progress);
    }
  }

  _onTransferComplete() {
    // set progress to 1
    this._onDownloadProgress(1);
    this._busy = false;
    this._deQueueFile();
    // remove file chunker if any
    this._fileSender = null;
    // do necessary clean up
  }

  _onFileReceived(proxyFile) {
    log$1("file-received ", proxyFile);
    Events.fire("file-received", proxyFile);
    this._sendJson({ type: "tranfer-complete" });
    // publish file received event for download dialog to initiate download
  }

  _onMessage(message) {
    // log("Received data  ", typeof message);
    // handle object type data
    if (typeof message != "string") {
      return this._onChunkReceived(message);
    }

    // log("parse ", message);
    let data = JSON.parse(message);
    // handle string type data
    switch (data.type) {
      case "partition":
        this._sendJson({ type: "partition-received", offset: data.offset });
        break;
      case "partition-received":
        log$1("partition-received", data.offset);
        this.nextPartition();
        break;
      case "text":
        // log("new text ", data.text);
        Events.fire("receive-text", data.text);
        break;
      // handle progress
      case "progress":
        this._onDownloadProgress(data.progress);
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

  sendProgress(progress) {
    this._sendJson({ type: "progress", progress });
  }

  _onDownloadProgress(progress) {
    Events.fire("file-progress", { sender: this.peerId, progress });
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
    this.channel = e.target || e.channel;
    this.channel.onmessage = (e) => this._onMessage(e.data);
    this.channel.onerror = this._onChannelClosed;
  }

  _onDataChannel(e) {
    // handle channel opened
    log$1("RTC: channel event ", e);
    this.channel = e.channel || e.target;
    this.channel.onmessage = (e) => this._onMessage(e.data);
    this.channel.onerror = e => this._onChannelClosed(e);
    this.channel.onclose = e => this._onChannelClosed(e);
  }

  _send(message) {
    if (!this.channel) this.refresh();
    // log("DC: send ",);
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
    this.peerConnection
      .setLocalDescription(new RTCSessionDescription(desc))
      .then((_) => {
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
    log$1('DC: channel', this.channel, e);
    if (!this.isCaller) return;
    this._connect(this.peerId, this.isCaller); // reconnect channel
  }

  onError(err) {
    log$1("error ", err);
  }

  refresh() {
    if (this.channel && this.channel.readyState === "open") return;
    if (this.channel && this.channel.readyState === "connecting") return;
    console.log("refresh...", this.channel, this.channel.readyState);
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

  _isConnected() {
    return this.channel && this.channel.readystate === 'open'
  }

  _isConnecting() {
    return this.channel && this.channel.readystate === 'connecting'
  }

  close() {
    this.peerConnection.close();
  }
}

const log$2 = console.log;
const isURL = (text) => /^((https?:\/\/|www)[^\s]+)/g.test(text.toLowerCase());

class Dialog {
  constructor(id) {
    this.$el = document.getElementById(id);
    this.$el
      .querySelector("[close]")
      .addEventListener("click", (e) => this.hide());
    this.$autoFocus = document.querySelector("[autoFocus]");
  }

  show() {
    this.$el.setAttribute("show", 1);
    if (this.$autoFocus) this.$autoFocus.focus();
  }

  hide() {
    this.$el.removeAttribute("show");
  }
}

class ReceiveFileDialog extends Dialog {
  constructor() {
    super("receiveDialog");
    this._fileQueue = [];
    Events.on("file-received", (e) => this._newFile(e.detail));
  }

  hide() {
    super.hide();
    this._deQueueFile();
  }

  _newFile(file) {
    // log("Dialog: file", , this._busy);
    // play notification sound
    if (file) this._fileQueue.push(file);

    if (this._busy) return;
    this._busy = true;
    let nextFile = this._fileQueue.shift();
    this._displayFile(nextFile);
  }

  _deQueueFile() {
    if (!this._fileQueue.length) {
      this._busy = false;
      return;
    }

    // schedule next file
    setTimeout(() => {
      this._busy = false;
      this._newFile();
    }, 400);
  }

  _displayFile(file) {
    this.$a = this.$el.querySelector("#download");
    const url = URL.createObjectURL(file.blob);
    this.$a.href = url;
    this.$a.download = file.name;
    this.show();

    this.$el.querySelector("#fileName").textContent = file.name;
    this.$el.querySelector("#size").textContent = this._getFileSize(file.size);

    // if download isn't supported use file reader to create data url and set as download link
  }

  _getFileSize(bytes) {
    if (bytes >= 1e9) {
      return Math.round(bytes / 1e8) / 10 + " GB";
    } else if (bytes >= 1e6) {
      return Math.round(bytes / 1e5) / 10 + " MB";
    } else if (bytes > 1000) {
      return Math.round(bytes / 1000) + " KB";
    } else {
      return bytes + " Bytes";
    }
  }
}

class ReceiveTextDialog extends Dialog {
  constructor() {
    super("receiveText");
    this.$text = this.$el.querySelector("#text");
    this.$el
      .querySelector("#copy")
      .addEventListener("click", (e) => this._onCopyText());
    Events.on("receive-text", (e) => this._onNewText(e.detail));
  }

  _onNewText(text) {
    this.$text.innerHTML = "";
    if (isURL(text)) {
      let a = document.createElement("a");
      a.href = text;
      a.textContent = text;
      a.target = "_blank";
      this.$text.appendChild(a);
    } else {
      this.$text.textContent = text;
    }
    this.show();
  }

  _onCopyText() {
    try {
      navigator.clipboard
        .writeText(this.$text.textContent)
        .then((val) => {
          log$2("copied text", this.$text.textContent);
          this.hide();
          // display toast
        })
        .catch((err) => {
          if (document.copyText(this.$text.textContent)) {
            // notify user
          }
          this.hide();
        });
    } catch (e) {
      if (document.copyText(this.$text.textContent)) ;
      this.hide();
    }
  }
}

class SendTextDialog extends Dialog {
  constructor() {
    super("sendText");
    this.$text = this.$el.querySelector("#input-text");
    this.$form = this.$el.querySelector("#sendTextForm");
    this.$form.addEventListener("submit", (e) => this._onSendText(e));
    Events.on("new-text", (e) => this._onNewText(e.detail));
  }

  _onNewText(receipient) {
    log$2("open sender: ", receipient);
    this._receipient = receipient;
    this.show();
    this.$text.setSelectionRange(0, this.$text.value.length);
  }

  _onSendText(e) {
    e.preventDefault();
    Events.fire("send-text", {
      to: this._receipient,
      text: this.$text.value,
    });
    this.hide();
  }
}

class AddPeerDialog extends Dialog {
  constructor() {
    super("addPeer");
    this.$text = this.$el.querySelector("#input-text");
    this.$form = this.$el.querySelector("#sendTextForm");
    this.$form.addEventListener("submit", (e) => this._onSendText(e));
    Events.on("add-peer", (e) => this._onNewText());
  }

  _onNewText() {
    log$2("AddPeer: ");
    // this._receipient = receipient;
    this.show();
    this.$text.setSelectionRange(0, this.$text.value.length);
  }

  _onSendText(e) {
    e.preventDefault();
    Events.fire("connect-peer", {
      host: this.$text.value,
      hostType: "name",
    });
    this.hide();
  }
}

document.copyText = (text) => {
  const span = document.createElement("span");
  span.textContent = text;

  span.style.position = "absolute";
  span.style.top = "-99999px";
  span.style.left = "-99999px";

  window.document.body.appendChild(span);

  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(range);

  let copied = false;
  try {
    copied = document.execCommand("copy");
    log$2("copied ", copied);
  } catch (e) {}

  selection.removeAllRanges();
  span.remove();

  return copied;
};

const log$3 = console.log;
const webSocketConnectionURL = "";

const getSocketURL = () => {
  let host = window.location.hostname;
  let socketURL = "";
  if (host === "locahost") {
    socketURL = `wss://${host}:8000`;
  } else {
    socketURL = `wss://${host}:8000`;
  }
  log$3("socket url ", socketURL);
  return socketURL;
};

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
    Events.on("connect-peer", (evt) => this._onConnectPeer(evt.detail));
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
    log$3("url ", getSocketURL());
    this.socket = io(getSocketURL());

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
      log$3(" socket connection error ", error);
    });

    this.socket.on("close", this.onDisconnect);

    this.socket.on("disconnect", (evt) => {
      log$3(" socket disconnected ", !this.socket.connected);
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
        log$3("Signal", message.type);
        Events.fire("signal", message);
        break;
      case "connect-peers":
        console.log("connect peers ", message);
        Events.fire("connect-peers", message);
        break;
      case "CONNECT_PEER_ERROR":
        //  handle error by displaying a toast or alert
        log$3("CONNECT_PEER_ERROR: ", message.message);
        // Event.fire('connect-peer-error', message);
        break;
    }
  }

  _onConnectPeer(data) {
    this.send({ ...data, type: "connect-peer" });
  }
  send(message) {
    console.log("send", message.type, message.to);
    this.socket.send(message);
  }

  cleanUp() {
    log$3("clean up task ", this.peerConnection);
    this.socket.close();
  }

  onDisconnect() {
    log$3(" socket disconnected ", !this.socket.connected);
  }

  disconnect() {
    log$3("disconnect ", this.socket, this.peerConnection);
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
         <div class="progress">
            <div class="circle"></div>
            <div class="circle right"></div>
          </div>
        <div class="peer-name"></div>
      </label>`;
  }

  initUI() {
    const el = document.createElement("div");
    el.classList.add("peer");
    el.id = this._peer.id;
    el.ui = this;
    el.innerHTML = this.html();
    el.querySelector("svg use").setAttribute("xlink:href", this._icon());
    el.querySelector(".peer-name").textContent = this._peer.displayName;
    this.$progress = el.querySelector(".progress");
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
    el.addEventListener("contextmenu", (e) => this._onRightClick(e));
    el.addEventListener("touchstart", (e) => this._onTouchStart(e));
    el.addEventListener("touchend", (e) => this._onTouchEnd(e));
  }

  _icon() {
    // assign an icon based on the device type
    if (["Mac OS", "Windows"].includes(this._peer.os)) return "#desktop-mac";
    if (
      ["Android", "iOS"].includes(this._peer.os) &&
      this._peer.model === "iPad"
    )
      return "#tablet-mac";
    if (["Android", "iOS"].includes(this._peer.os)) return "#phone-iphone";
    return "#tablet-mac";
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

  _onTouchStart() {
    this._touchStart = Date.now();
    this._touchTimer = setTimeout(() => this._onTouchEnd(), 600);
  }

  _onTouchEnd(evt) {
    if (!(Date.now() - this._touchStart < 500)) {
      log$3("end touch ", Date.now() - this._touchStart < 500);
      if (evt) evt.preventDefault();
      Events.fire("new-text", this._peer.id);
    }
    clearTimeout(this._touchTimer);
  }

  _onRightClick(e) {
    e.preventDefault();
    Events.fire("new-text", this._peer.id);
  }

  setProgress(progress) {
    // log("progress ", progress);
    // handle code visually indicate UI progress
    if (progress < 0.5) {
      this.$progress.classList.remove("over50");
    } else {
      this.$progress.classList.add("over50");
    }
    this.$progress.style.setProperty(
      "--progress",
      `rotate(${360 * progress}deg)`
    );

    if (progress >= 1) {
      return this.setProgress(0);
    }
  }
}

class PeersManager {
  constructor(serverConnection) {
    this.peers = {};
    this.server = serverConnection;
    Events.on("signal", (evt) => this._onSignal(evt.detail));
    Events.on("peers", (evt) => this._onPeers(evt.detail));
    Events.on("connect-peers", (evt) => this._onPeers(evt.detail));
    // Events.on("peer-joined", (e) => this.onPeer(e.detail));
    Events.on("files-selected", (evt) => this._onFileSelected(evt.detail));
    Events.on("peer-left", (evt) => this._onPeerLeft(evt.detail));
    Events.on("send-text", (evt) => this._onSendText(evt.detail));
  }

  onPeer(peer) {
    if (this.peers[peer.id]) {
      // handle existing peers
      this.peers[peer.id].refresh();
      return;
    } else {
      this.peers[peer.id] = new PeerConnection(this.server, peer.id);
      // Events.fire('peer-joined', peer);
      // handle browsers that don't support RTCPeer
    }
  }

  _onPeers(data) {
    let peers = data.peers;
    peers.forEach((peer) => this.onPeer(peer));
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
    // log("file selected ", message.to, this.peers[message.to]);

    // TODO: handle cases where peer isn't found
    this.peers[message.to].sendFiles(message.files);
  }

  _onPeerLeft(message) {
    // console.log("peer-left ", message);
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
    this.$body = document.getElementsByTagName("body")[0];
    Events.on("peers", (e) => this.onPeersJoined(e.detail));
    Events.on("connect-peers", (e) => this.onConnectPeers(e.detail));
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
    this.togglePeerView();
  }

  onConnectPeers(data) {
    data.peers.forEach((peer) => {
      this.onPeerJoined(peer);
    });
    this.togglePeerView();
  }

  onPeerJoined(peer) {
    if (document.getElementById(peer.id)) return;
    let peerUI = new PeerUI(peer);
    this.$el.appendChild(peerUI.$el);
    log$3("peer joined ", peer.id);
    this.togglePeerView();
  }

  onPeerLeft(data) {
    const peer = document.getElementById(data.peerId);
    if (peer) {
      this.$el.removeChild(peer);
    }
    this.togglePeerView();
  }

  togglePeerView() {
    let children = [...this.$el.querySelectorAll(".peer")];
    let count = children.length;
    console.log('children ', children, 'count ', count);
    if (count > 0) {
      this.$body.setAttribute("data-peer", true);
    } else {
      this.$body.setAttribute("data-peer", false);
    }
  }

  onPaste(e) {}

  onFileProgress(data) {
    let peer = document.getElementById(data.sender);
    peer && peer.ui.setProgress(data.progress);
  }

  clearPeers() {
    let children = [...this.$el.querySelectorAll('peer')];
    console.log('peers.... ', children);
    children.forEach(child => child.remove());    
  }
}
class Application {
  constructor() {
    this.server = new Server();
    this.peersManager = new PeersManager(this.server);
    this.peersUI = new PeersUI();
    this.receiveFileDialog = new ReceiveFileDialog();
    this.receiveTextDialog = new ReceiveTextDialog();
    this.sendTextDialog = new SendTextDialog();
    this.addPeerDialog = new AddPeerDialog();
    log$3("app initialized ");
  }
}

// Initialize application
const app = new Application();

const themeSwitch = document.querySelector(
  '.theme_switch input[type="checkbox"]'
);
themeSwitch.addEventListener(
  "change",
  (e) => {
    switchTheme(e.target.checked);
  },
  false
);

// dispatch add peer event if join peer button is clicked
const joinPeers = [...document.querySelectorAll("div.add-peer")];
joinPeers.forEach((joinPeer) => {
  joinPeer.addEventListener("click", () => {
    Events.fire("add-peer");
  }, false);
});

function switchTheme(dark = false) {
  // console.log("theme ", dark, typeof dark);
  if (dark == true || dark == "true") {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("data-theme", "true");

    if (!themeSwitch.checked) {
      themeSwitch.checked = true;
    }
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("data-theme", "false");
  }
}

/**
 * Todo:
 * 2. Fallback to socket for sending files and texts if webRtc isn't supported
 */
switchTheme(localStorage.getItem("data-theme"));
