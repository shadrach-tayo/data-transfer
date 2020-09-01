
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
const { RTCPeerConnection, RTCSessionDescription } = window;
const log = console.log;


const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const miniVideo = document.getElementById("mini-video");
const callModal = document.getElementById("call-modal");

class PeerConnection {
  constructor(config, stream, socket) {
    this.socket = socket;
    this.stream = stream;
    this.config = config;
    this.existingTracks = [];
    this.createPeerConnection();
  }

  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.config);
    this.addLocalStream();
    this.listenToPeerEvents();
  }

  startRemoteConnection(clientId) {
    if (this.channel) channel.close();

    this.channel = this.peerConnection.createDataChannel("chat-channel");

    this.remoteClientId = clientId;
    this.createOffer(clientId);
  }

  listenToPeerEvents() {
    this.peerConnection.ontrack = (evt) => {
      console.log("Received streams ", evt.streams);
      document.getElementById("remote-video").srcObject = event.streams[0];
    };

    this.peerConnection.ondatachannel = (evt) => {
      log("Received data channel ", evt.channel);
    };

    this.peerConnection.onicecandidate = (evt) => {
      log("ICE Candidate created ", evt.candidate);
      if (evt.candidate) {
        log("Sending ICE Candidate - ", evt.candidate.candidate);
        this.socket.emit("request", {
          id: this.remoteClientId,
          candidate: evt.candidate,
          type: "candidate",
        });
      }
    };

    this.peerConnection.onicegatheringstatechange = (evt) => {
      log("ICE Candidate gathering state ", evt);
    };

    this.peerConnection.onicecandidateerror = (err) => {
      log("ICE candidate error ", err);
    };

    this.peerConnection.onconnectionstatechange = (evt) => {
      log("Connection state changed ", this.peerConnection);
      if (this.peerConnection.connectionState === "connected") {
        this.stream.getTracks().forEach((track, index) => {
          console.log(
            "tracks ",
            track,
            "senders ",
            this.peerConnection.getSenders()
          );
        });
      } else if (
        this.peerConnection.connectionState === "disconnected" ||
        this.peerConnection.connectionState === "failed"
      ) {
        miniVideo.srcObject = null;
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;

        callModal.classList.remove("show");

        callModal.classList.remove(CALL_STATES.INCOMING);
        callModal.classList.remove(CALL_STATES.ACCEPTED);
        callModal.classList.remove(CALL_STATES.OUTGOING);

        this.peerConnection.close();
        log("disconnected ");
      }
    };

    this.peerConnection.onsignalingstatechange = (evt) => {
      log("signaling state changed ", evt, this.peerConnection);
    };
  }

  addLocalStream(stream) {
    for (const track of this.stream.getTracks()) {
      this.existingTracks.push(
        this.peerConnection.addTrack(track, this.stream)
      );
    }
  }

  createAnswer(clientId = this.remoteClientId) {
    if (clientId != this.remoteClientId) return;
    this.peerConnection
      .createAnswer()
      .then((answer) => {
        log("sending answer ", answer);

        this.socket.emit("request", {
          id: clientId,
          answer: answer,
          type: "answer",
        });

        // set offer description
        this.peerConnection.setLocalDescription(answer);
      })
      .catch((err) => log("error creating answer ", err));
  }

  handleAnswer(data) {
    console.log("handle answer ", data);
    this.remoteClientId = data.from;
    this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  }

  createOffer(clientId) {
    this.peerConnection
      .createOffer({ offerToReceiveAudio: 1, offerToReceiveVideo: 1 })
      .then((offer) => {
        log("offer ", offer);

        this.remoteClientId = clientId; // set remote clientId to receiver's id

        this.socket.emit("request", {
          id: clientId,
          offer: offer,
          type: "offer",
        });

        // set offer description
        this.peerConnection.setLocalDescription(offer);
      })
      .catch((err) => log("error creating offer ", err));
  }

  handleOffer(data) {
    console.log("handle offer ", data);
    this.remoteClientId = data.from;
    this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );
  }

  resetTracks() {
    let peer = this;
    this.stream.getTracks().forEach(function (track, index) {
      peer.peerConnection.addTrack(track, peer.stream);
      peer.peerConnection.getSenders().find(function (s) {
        if (s.track.kind == track.kind) {
          s.replaceTrack(track);
        }
      });
    });
  }

  toggleMediaStreamTrack(type, on = false) {
    if (this.stream) {
      this.stream[`get${type}Tracks`]().forEach((track) => {
        track.enabled = on;
        console.log('type ', track, on);
      });
    }
  }

  updateStream(stream) {
    this.stream = stream;
    this.resetTracks();
  }

  addIceCandidate(data) {
    log("ICE Candidate received - ", data.candidate);
    this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  close() {
    this.peerConnection.close();
  }
}

const turnServerIPAddress = "3.81.63.29";
const turnServerPort = "3478";
const turnServerUserName = "shadrachtayo";
const turnServerPassword = "shadrach19";

const configuration = {
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

const log$1 = console.log;
const webSocketConnection = "wss://localhost:8000";

const CALL_STATES$1 = {
  ACCEPTED: "accepted",
  INCOMING: "incoming",
  OUTGOING: "outgoing",
};

function getUserLocalMedia(cameraConfig) {
  console.log('config ', cameraConfig);
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
  document.getElementById("localId").textContent = id;
}

const localVideo$1 = document.getElementById("local-video");
const remoteVideo$1 = document.getElementById("remote-video");
const miniVideo$1 = document.getElementById("mini-video");
const callBtn = document.getElementById("call-btn");
const callModal$1 = document.getElementById("call-modal");
const remoteIdInput = document.getElementById("remote-id");

// call controll buttons
const pickCall = document.getElementById("pick-call");
const dropCall = document.getElementById("drop-call");
const switchCamera = document.getElementById("switch-camera");
const toggleVideo = document.getElementById("toggle-video");
const toggleAudio = document.getElementById("toggle-audio");

class Application {
  constructor() {
    console.log("app");
    this.displayVideo = true;
    this.displayAudio = true;
    this.cameraConfig = {
      video: true,
      audio: true,
    };
    this.initializeSocketAndStream();
  }

  initializeSocketAndStream() {
    console.log("camera ", this.cameraConfig);
    getUserLocalMedia(this.cameraConfig)
      .then((stream) => {
        let localVideo = document.getElementById("local-video");
        this.localStream = stream;
        console.log("track", this.localStream.getTracks());

        if (localVideo) {
          // localVideo.srcObject = stream;
          try {
            this.connectToWebSocket();
            console.log("app socket ", this.socket);
          } catch (e) {
            console.log("Couldn\t connect to web sockets");
          }
        }
      })
      .catch((error) => {
        console.log("error: could not access webcam  ", error);
      });
  }

  connectToWebSocket() {
    this.socket = io(webSocketConnection);

    this.socket.on("connect", () => {
      // createRTCPeerConnection();
      console.log("connected ", this.socket);
      setLocalId(this.socket.id);
      // peerConnection = new PeerConnection(configuration, localStream);
    });

    this.socket.on("reconnect_attempt", () => {
      // console.log("reconnect ");
      this.socket.io.opts.transports = ["polling", "websocket"];
    });

    this.socket.on("error", (error) => {
      log$1(" socket connection error ", error);
    });

    this.socket.on("close", (evt) => {
      log$1("Web socket connection closed ", evt);
    });

    this.socket.on("disconnect", (evt) => {
      log$1(" socket disconnected ", !this.socket.connected);
    });

    this.socket.on("message", (evt) => {
      log$1("socket message received ", evt);
    });

    this.socket.on("update-users-list", ({ users }) => {
      log$1("update users ", users);
      // updateUserList(users);
    });

    this.socket.on("remove-user", ({ socketId }) => {
      log$1("remove user ", socketId);
      // removeUser(socketId);
    });

    // Handle messages recieved in socket
    this.socket.on("request", (event) => {
      log$1("requst ", this);
      let jsonData = event;

      switch (jsonData.type) {
        case "candidate":
          this.peerConnection.addIceCandidate(jsonData);
          break;
        case "offer":
          this.handleIncomingCall(jsonData);
          // this.peerConnection.handleOffer(jsonData);
          break;
        case "answer":
          this.peerConnection.handleAnswer(jsonData);
          break;
      }
    });

    socket.connect(webSocketConnection);
    return socket;
  }

  startCall(remoteClientId) {
    this.remoteClientId = remoteClientId;
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new PeerConnection(
      configuration,
      this.localStream,
      this.socket
    );
    this.peerConnection.startRemoteConnection(this.remoteClientId);
    miniVideo$1.srcObject = this.localStream;

    callModal$1.classList.add("show");
    callModal$1.classList.add(CALL_STATES$1.OUTGOING);
  }

  handleIncomingCall(data) {
    this.offerData = data;
    this.remoteClientId = data.from;

    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new PeerConnection(
      configuration,
      this.localStream,
      this.socket
    );
    this.peerConnection.handleOffer(this.offerData);

    callModal$1.classList.add("show");
    callModal$1.classList.add(CALL_STATES$1.INCOMING);
    // this.peerConnection.startRemoteConnection(this.remoteClientId)
  }

  acceptCall() {
    this.peerConnection.createAnswer(this.remoteClientId);
    miniVideo$1.srcObject = this.localStream;
  }

  declineCall() {
    this.peerConnection.close();

    miniVideo$1.srcObject = null;
    localVideo$1.srcObject = null;
    remoteVideo$1.srcObject = null;

    callModal$1.classList.remove("show");

    callModal$1.classList.remove(CALL_STATES$1.INCOMING);
    callModal$1.classList.remove(CALL_STATES$1.ACCEPTED);
    callModal$1.classList.remove(CALL_STATES$1.OUTGOING);
  }

  toggleMediaStreamTrack(type, on = false) {
    if (this.localStream) {
      this.localStream[`get${type}Tracks`]().forEach((track) => {
        track.enabled = on;
      });
    }
  }

  toggleVideo() {
    this.displayVideo = !this.displayVideo;
    this.peerConnection.toggleMediaStreamTrack('Video', this.displayVideo);
    
  }
  
  toggleAudio() {
    this.displayAudio = !this.displayAudio;
    this.peerConnection.toggleMediaStreamTrack('Audio', this.displayAudio);
  }
}

const app = new Application();

callBtn.onclick = () => {
  console.log('call ', remoteIdInput.value);
  app.startCall(remoteIdInput.value.trim());
};

pickCall.onclick = () => {
  app.acceptCall();
  callModal$1.classList.remove(CALL_STATES$1.INCOMING);
  callModal$1.classList.add(CALL_STATES$1.ACCEPTED);
};

/**
 * TODO:
 * 1. send decline signal over socket, to notifiy  caller of declined call state
 */
dropCall.onclick = () => {
  app.declineCall();
  callModal$1.classList.remove(CALL_STATES$1.INCOMING);
  callModal$1.classList.remove(CALL_STATES$1.ACCEPTED);
};

toggleVideo.onclick = app.toggleVideo.bind(app);
toggleAudio.onclick = app.toggleAudio.bind(app);
