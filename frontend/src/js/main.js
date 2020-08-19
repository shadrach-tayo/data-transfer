const { RTCPeerConnection, RTCSessionDescription } = window;

let socket,
  localStream,
  existingTracks = [],
  peerConnection,
  channel,
  remoteClientId,
  localClientId;

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

let cameraConfig = {
  video: true,
  audio: true,
};

class PeerConnection {
  constructor(config, stream) {
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
        socket.emit("request", {
          id: remoteClientId,
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
        this.stream.getTracks().forEach(function (track, index) {
          console.log(
            "tracks ",
            track,
            "senders ",
            this.peerConnection.getSenders()
          );
          // this.peerConnection.addTrack(track, localStream);
          // this.peerConnection.getSenders().find(function (s) {
          //   console.log('sender ', s)
          //   if (s.track.kind == track.kind) {
          //     s.replaceTrack(track);
          //   }
          // });
        });
      } else if (this.peerConnection.connectionState === "disconnected") {
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

  createAnswer(clientId) {
    if (!clientId) return;
    this.peerConnection
      .createAnswer()
      .then((answer) => {
        log("sending answer ", answer);

        socket.emit("request", {
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
    remoteClientId = data.from;
    this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  }

  createOffer(clientId) {
    this.peerConnection
      .createOffer({ offerToReceiveAudio: 1, offerToReceiveVideo: 1 })
      .then((offer) => {
        log("offer ", offer);

        remoteClientId = clientId; // set remote clientId to receiver's id

        socket.emit("request", { id: clientId, offer: offer, type: "offer" });

        // set offer description
        this.peerConnection.setLocalDescription(offer);
      })
      .catch((err) => log("error creating offer ", err));
  }

  handleOffer(data) {
    console.log("handle offer ", data);
    remoteClientId = data.from;
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

  updateStream(stream) {
    this.stream = stream;
    this.resetTracks();
  }

  addIceCandidate(data) {
    log("ICE Candidate received - ", data.candidate);
    this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

const log = console.log;
const webSocketConnection = "wss://localhost:8000";

function getUserLocalMedia() {
  return new Promise((resolve, reject) => {
    navigator.getWebCam =
      navigator.getUserMedia ||
      navigator.webKitGetUserMedia ||
      navigator.moxGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    if (navigator.getWebCam) {
      navigator.getUserMedia(
        cameraConfig,
        resolve,
        reject
      );
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then(resolve, reject);
    }
  });

  // function getMediaSuccess(stream) {}
}

getUserLocalMedia()
  .then((stream) => {
    const localVideo = document.getElementById("local-video");
    localStream = stream;
    console.log("tracks ", localStream.getTracks());

    if (localVideo) {
      localVideo.srcObject = stream;
      connectToWebSocket();
    }
  })
  .catch((error) => {
    console.log("error: could not access webcam  ", error);
  });

function connectToWebSocket() {
  socket = io({ transports: ["websocket"] });

  socket.on("connect", () => {
    // createRTCPeerConnection();
    peerConnection = new PeerConnection(configuration, localStream);
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
    updateUserList(users);
  });

  socket.on("remove-user", ({ socketId }) => {
    log("remove user ", socketId);
    removeUser(socketId);
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
}

// async function createRTCPeerConnection() {
//   peerConnection = new RTCPeerConnection(configuration);
//   log("peer ", peerConnection);

//   for (const track of localStream.getTracks()) {
//     existingTracks.push(peerConnection.addTrack(track, localStream));
//   }

//   peerConnection.ontrack = (evt) => {
//     console.log("Received streams ", evt.streams);
//     document.getElementById("remote-video").srcObject = event.streams[0];
//   };

//   peerConnection.ondatachannel = (evt) => {
//     log("Received data channel ", evt.channel);
//   };

//   peerConnection.onicecandidate = (evt) => {
//     log("ICE Candidate created ", evt.candidate);
//     if (evt.candidate) {
//       log("Sending ICE Candidate - ", evt.candidate.candidate);
//       socket.emit("request", {
//         id: remoteClientId,
//         candidate: evt.candidate,
//         type: "candidate",
//       });
//     }
//   };

//   peerConnection.onicegatheringstatechange = (evt) => {
//     log("ICE Candidate gathering state ", evt);
//   };

//   peerConnection.onicecandidateerror = (err) => {
//     log("ICE candidate error ", err);
//   };

//   peerConnection.onconnectionstatechange = (evt) => {
//     log("Connection state changed ", peerConnection);
//     if (peerConnection.connectionState === "connected") {
//       localStream.getTracks().forEach(function (track, index) {
//         console.log("tracks ", track, "senders ", peerConnection.getSenders());
//         // peerConnection.addTrack(track, localStream);
//         // peerConnection.getSenders().find(function (s) {
//         //   console.log('sender ', s)
//         //   if (s.track.kind == track.kind) {
//         //     s.replaceTrack(track);
//         //   }
//         // });
//       });
//     } else if (peerConnection.connectionState === "disconnected") {
//       log("disconnected ");
//     }
//   };

//   peerConnection.onsignalingstatechange = (evt) => {
//     log("signaling state changed ", evt, peerConnection);
//   };

//   // createAndSendOffer();
// }

// function resetTracks() {
//   localStream.getTracks().forEach(function (track, index) {
//     peerConnection.addTrack(track, localStream);
//     peerConnection.getSenders().find(function (s) {
//       if (s.track.kind == track.kind) {
//         s.replaceTrack(track);
//       }
//     });
//   });
// }

function createAndSendOffer(clientId) {
  peerConnection
    .createOffer({ offerToReceiveAudio: 1 })
    .then((offer) => {
      log("offer ", offer);

      remoteClientId = clientId; // set remote clientId to receiver's id

      socket.emit("request", { id: clientId, offer: offer, type: "offer" });

      // set offer description
      peerConnection.setLocalDescription(offer);
    })
    .catch((err) => log("error creating offer ", err));
}

function createAndSendAnswer(clientId) {
  if (!clientId) return;
  peerConnection
    .createAnswer()
    .then((answer) => {
      log("sending answer ", answer);

      socket.emit("request", { id: clientId, answer: answer, type: "answer" });

      // set offer description
      peerConnection.setLocalDescription(answer);
    })
    .catch((err) => log("error creating answer ", err));
}

// function handleOffer(data) {
//   console.log("handle offer ", data);
//   remoteClientId = data.from;
//   peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
// }

// function handleAnswer(data) {
//   console.log("handle answer ", data);
//   remoteClientId = data.from;
//   peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
// }

// function handleCandidate(data) {
//   // if(remoteClientId !== data.from)
//   log("ICE Candidate received - ", data.candidate);
//   peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));

//   // activate button to create answer
// }

function callUser(clientId) {
  console.log("starting call........ ", clientId);
  peerConnection.startRemoteConnection(clientId);
}

function updateUserList(socketIds) {
  const activeUserContainer = document.getElementById("active-user-container");

  socketIds.forEach((socketId) => {
    const alreadyExistingUser = document.getElementById(socketId.id);
    if (!alreadyExistingUser) {
      const userContainerEl = createUserItemContainer(socketId.id);
      activeUserContainer.appendChild(userContainerEl);
    }
  });
}

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
    callUser(socketId);
  });
  return userContainerEl;
}

function removeUser(userId) {
  // const activeUserContainer = document.getElementById("active-user-container");
  const userEl = document.getElementById(userId);
  userEl.parentNode.removeChild(userEl);
}

let incomingCallBtn = document.getElementById("incoming-call");
incomingCallBtn.addEventListener("click", (_) => {
  peerConnection.createAnswer(remoteClientId);
});

function toggleMediaStreamTrack(type, on = false) {
  // cameraConfig = {...cameraConfig, video: !cameraConfig.video}

  // getUserLocalMedia().then(stream => {
  //   console.log('toggle video ', stream);
  //   peerConnection.updateStream(stream)
  // }).catch(e => log('media error ', e))

  if(localStream) {
    localStream[`get${type}Tracks`]().forEach(track  => {
      track.enabled = on;
    })
  }
}
