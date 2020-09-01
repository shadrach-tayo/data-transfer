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
const webSocketConnection = "wss://localhost:8000";

const CALL_STATES = {
  ACCEPTED: "accepted",
  INCOMING: "incoming",
  OUTGOING: "outgoing",
};

function getUserLocalMedia(cameraConfig) {
  console.log('config ', cameraConfig)
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

// getUserLocalMedia()
//   .then((stream) => {
//     const localVideo = document.getElementById("local-video");
//     localStream = stream;
//     console.log("tracks ", localStream.getTracks());

//     if (localVideo) {
//       localVideo.srcObject = stream;
//       try {
//         connectToWebSocket();
//       } catch (e) {
//         console.log("Couldn\t connect to web sockets");
//       }
//     }
//   })
//   .catch((error) => {
//     console.log("error: could not access webcam  ", error);
//   });

/*
function connectToWebSocket() {
  socket = io(webSocketConnection);

  socket.on("connect", () => {
    // createRTCPeerConnection();
    console.log("connected ", socket);
    setLocalId(socket.id);
    // peerConnection = new PeerConnection(configuration, localStream);
  });

  socket.on("reconnect_attempt", () => {
    // console.log("reconnect ");
    socket.io.opts.transports = ["polling", "websocket"];
  });

  socket.on("error", (error) => {
    log(" socket connection error ", error);
  });

  socket.on("close", (evt) => {
    log("Web socket connection closed ", evt);
  });

  socket.on("disconnect", (evt) => {
    log(" socket disconnected ", !socket.connected);
  });

  socket.on("message", (evt) => {
    log("socket message received ", evt);
  });

  socket.on("update-users-list", ({ users }) => {
    log("update users ", users);
    // updateUserList(users);
  });

  socket.on("remove-user", ({ socketId }) => {
    log("remove user ", socketId);
    // removeUser(socketId);
  });

  // Handle messages recieved in socket
  socket.on("request", function (event) {
    jsonData = event;
    log("requst ", event);

    switch (jsonData.type) {
      case "candidate":
        peerConnection.addIceCandidate(jsonData);
        break;
      case "offer":
        peerConnection.handleOffer(jsonData);
        break;
      case "answer":
        peerConnection.handleAnswer(jsonData);
        break;
      default:
        break;
    }
  });

  socket.connect(webSocketConnection);
  return socket;
}
*/

/*
function callUser(clientId) {
  console.log("starting call........ ", clientId);
  peerConnection.startRemoteConnection(clientId);
}
*/

// function updateUserList(socketIds) {
//   const activeUserContainer = document.getElementById("active-user-container");

//   socketIds.forEach((socketId) => {
//     const alreadyExistingUser = document.getElementById(socketId.id);
//     if (!alreadyExistingUser) {
//       const userContainerEl = createUserItemContainer(socketId.id);
//       activeUserContainer.appendChild(userContainerEl);
//     }
//   });
// }

/*
function createUserItemContainer(socketId) {
  const userContainerEl = document.createElement("div");

  const usernameEl = document.createElement("p");

  userContainerEl.setAttribute("class", "active-user");
  userContainerEl.setAttribute("id", socketId);
  usernameEl.setAttribute("class", "username");
  usernameEl.innerHTML = `Socket: ${socketId}`;

  userContainerEl.appendChild(usernameEl);

  userContainerEl.addEventListener("click", () => {
    // unselectUsersFromList();

    userContainerEl.setAttribute("class", "active-user active-user--selected");
    const talkingWithInfo = document.getElementById("talking-with-info");
    talkingWithInfo.innerHTML = `Talking with: "Socket: ${socketId}"`;
    // callUser(socketId);
  });

  return userContainerEl;
} */

function removeUser(userId) {
  // const activeUserContainer = document.getElementById("active-user-container");
  const userEl = document.getElementById(userId);
  userEl.parentNode.removeChild(userEl);
}

function setLocalId(id) {
  document.getElementById("localId").textContent = id;
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
      log(" socket connection error ", error);
    });

    this.socket.on("close", (evt) => {
      log("Web socket connection closed ", evt);
    });

    this.socket.on("disconnect", (evt) => {
      log(" socket disconnected ", !this.socket.connected);
    });

    this.socket.on("message", (evt) => {
      log("socket message received ", evt);
    });

    this.socket.on("update-users-list", ({ users }) => {
      log("update users ", users);
      // updateUserList(users);
    });

    this.socket.on("remove-user", ({ socketId }) => {
      log("remove user ", socketId);
      // removeUser(socketId);
    });

    // Handle messages recieved in socket
    this.socket.on("request", (event) => {
      log("requst ", this);
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
    this.displayVideo = !this.displayVideo
    this.peerConnection.toggleMediaStreamTrack('Video', this.displayVideo)
    
  }
  
  toggleAudio() {
    this.displayAudio = !this.displayAudio
    this.peerConnection.toggleMediaStreamTrack('Audio', this.displayAudio)
  }
}

const app = new Application();

callBtn.onclick = () => {
  console.log('call ', remoteIdInput.value);
  app.startCall(remoteIdInput.value.trim());
}

pickCall.onclick = () => {
  app.acceptCall();
  callModal.classList.remove(CALL_STATES.INCOMING)
  callModal.classList.add(CALL_STATES.ACCEPTED)
}

/**
 * TODO:
 * 1. send decline signal over socket, to notifiy  caller of declined call state
 */
dropCall.onclick = () => {
  app.declineCall();
  callModal.classList.remove(CALL_STATES.INCOMING);
  callModal.classList.remove(CALL_STATES.ACCEPTED);
}

toggleVideo.onclick = app.toggleVideo.bind(app)
toggleAudio.onclick = app.toggleAudio.bind(app)