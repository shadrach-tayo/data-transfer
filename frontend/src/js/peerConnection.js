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

export { PeerConnection };
