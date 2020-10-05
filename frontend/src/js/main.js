import PeerConnection from "./peerConnection";

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

const log = console.log;
const webSocketConnection = "SOCKET_URL";

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

function removeUser(userId) {
  // const activeUserContainer = document.getElementById("active-user-container");
  const userEl = document.getElementById(userId);
  userEl.parentNode.removeChild(userEl);
}

function setLocalId(id) {
  document.getElementById("localId").textContent = id;
}

function setLocalName(name) {
  document.getElementById("peerName").textContent = name;
}

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const miniVideo = document.getElementById("mini-video");
const callBtn = document.getElementById("call-btn");
const callModal = document.getElementById("call-modal");
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
    this.reconnectTimer = null;
    Events.on("beforeunload", (e) => this.disconnect());
    Events.on("pagehide", (e) => this.disconnect());
    document.addEventListener("visibilitychange", (e) =>
      this.onVisibilityChange()
    );
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
    console.log('connect to socket')
    if (this.socket && this.socket.connected === true) return;

    this.socket = io(webSocketConnection);

    this.socket.on("connect", () => {
      console.log("connected ", this.socket);
      setLocalId(this.socket.id);
      
    });

    this.socket.on("reconnect_attempt", () => {
      // console.log("reconnect ");
      this.socket.io.opts.transports = ["polling", "websocket"];
    });

    this.socket.on("error", (error) => {
      log(" socket connection error ", error);
    });

    this.socket.on("close", (evt) => {
      log("Web socket connection closed ", evt);
    });

    this.socket.on("disconnect", (evt) => {
      log(" socket disconnected ", !this.socket.connected);
      this.onDisconnected();
    });

    this.socket.on("message", this.onMessage);
    
    // Handle messages recieved in socket
    this.socket.on("request", (event) => {
      log("requst ", event);
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
        default:
          break;
      }
    });

    this.socket.connect(webSocketConnection);
    return this.socket;
  }

  onMessage(message) {
   
   switch(message.type) {
     case 'displayName':
       console.log('display name ', message.name)
       setLocalName(message.name);
       break;
   }
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
    miniVideo.srcObject = this.localStream;

    callModal.classList.add("show");
    callModal.classList.add(CALL_STATES.OUTGOING);
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

    callModal.classList.add("show");
    callModal.classList.add(CALL_STATES.INCOMING);
    // this.peerConnection.startRemoteConnection(this.remoteClientId)
  }

  acceptCall() {
    this.peerConnection.createAnswer(this.remoteClientId);
    miniVideo.srcObject = this.localStream;
  }

  declineCall() {
    this.peerConnection.close();

    miniVideo.srcObject = null;
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    callModal.classList.remove("show");

    callModal.classList.remove(CALL_STATES.INCOMING);
    callModal.classList.remove(CALL_STATES.ACCEPTED);
    callModal.classList.remove(CALL_STATES.OUTGOING);
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
    this.peerConnection.toggleMediaStreamTrack("Video", this.displayVideo);
  }

  toggleAudio() {
    this.displayAudio = !this.displayAudio;
    this.peerConnection.toggleMediaStreamTrack("Audio", this.displayAudio);
  }

  cleanUp() {
    console.log("clean up task ", this.peerConnection);
    this.socket.close();
    this.peerConnection.close();
  }

  onDisconnected() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(_ => this.connectToWebSocket(), 5000)
  }

  disconnect() {
    console.log("disconnect ", this.socket, this.peerConnection);
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }

  onVisibilityChange() {
    console.log("visibilty change ", document.hidden);
    if (document.hidden) return;
    // this.connectToWebSocket();
  }
}

class Events {
  static fire(type, data) {
    return window.dispatchEvent(new CustomEvent(type, { detail: data }));
  }

  static on(type, callback) {
    console.log("listen to ", type);
    return window.addEventListener(type, callback, false);
  }
}

// Initialize application
const app = new Application();


/**
 * Todo:  
 * 1. when peers connect open a modal to send files between peers
 * 2. create file-transfer data-channel for transfers between peers when user chooses to send files
 * 3. send files in binary/arraybuffer format
 * 5. send files, texts or links between peers using a file transfer data-channel
 * Implement a server connection that takes care of the socket/server implementations
 * 4. implement a FileChunker and a FileDigester to ease file transfer between peers
 *
 */
