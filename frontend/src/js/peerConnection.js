import { FileDigester, Events } from "./utils";
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

class RTCPeer {
  constructor(peerId, server) {
    this.peerId = peerId;
    this.server = server;
    this._fileQueue = [];
    this._busy = false;
  }

  sendFiles(files) {
    log("files ", files.length, this._busy);
    for (let i = 0; i < files.length; i++) {
      this._fileQueue.push(files[i]);
    }
    if (this._busy) return;
    this._deQueueFile();
  }

  _deQueueFile() {
    log("dequeue file -----------------", this._fileQueue.length, this._busy);
    if (!this._fileQueue.length) return;
    this._busy = true;
    let file = this._fileQueue.shift();
    this.sendFile(file);
  }

  _sendJson(data) {
    this._send(JSON.stringify(data));
  }

  sendText(text) {
    this._sendJson({type: 'text', text})
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
      log("RTC: ", e.target.result);
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
    log("file-received ", proxyFile);
    Events.fire("file-received", proxyFile);
    this._sendJson({ type: "tranfer-complete" });
    // publish file received event for download dialog to initiate download
  }

  _onMessage(message) {
    log("Received data  ", typeof message);
    // handle object type data
    if (typeof message != "string") {
      return this._onChunkReceived(message);
    }

    log("parse ", message);
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
      .catch((err) => log("error ", err));
  }

  _channelOpened(e) {
    // handle channel opened
    log("RTC: channel opened ", e);
    this.channel = e.channel || e.target;
    this.channel.onmessage = (e) => this._onMessage(e.data);
    this.channel.onerror = this._onChannelClosed;
  }

  _onDataChannel(e) {
    // handle channel opened
    log("RTC: channel event ", e);
    this.channel = e.channel || e.target;
    this.channel.onmessage = (e) => this._onMessage(e.data);
    this.channel.onerror = this._onChannelClosed;
  }

  _send(message) {
    if (!this.channel) this.refresh();
    log("send ", message);
    this.channel.send(message);
  }

  onConnectionStateChange(evt) {
    log(
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
    log("WS: ", data);
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
    log("error ", err);
  }

  refresh() {
    if (this.channel && this.channel.readystate === "open") return;
    if (this.channel && this.channel.readystate === "connection") return;
    this._connect(this.peerId, this.isCaller);
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

export { PeerConnection };
