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

let incomingCallBtn = document.getElementById("incoming-call");
incomingCallBtn.addEventListener("click", (_) => {
  createAndSendAnswer(remoteClientId);
});

const log = console.log;
const webSocketConnection = "wss://localhost:8000";

function getUserMedia() {
  navigator.getWebCam =
    navigator.getUserMedia ||
    navigator.webKitGetUserMedia ||
    navigator.moxGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  if (navigator.getWebCam) {
    navigator.getUserMedia(
      { video: true, audio: true },
      getMediaSuccess,
      function getWebCamError(error) {}
    );
  } else {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(getMediaSuccess, (error) => {
        console.log("error: could not access webcam  ", error);
      });
  }

  function getMediaSuccess(stream) {
    const localVideo = document.getElementById("local-video");
    localStream = stream;
    console.log("tracks ", localStream.getTracks());

    if (localVideo) {
      localVideo.srcObject = stream;
      connectToWebSocket();
    }
  }
}

getUserMedia();

function connectToWebSocket() {
  socket = io({ transports: ["websocket"] });

  socket.on("connect", () => {
    createRTCPeerConnection();
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
        handleCandidate(jsonData);
        break;
      case "offer":
        handleOffer(jsonData);
        break;
      case "answer":
        handleAnswer(jsonData);
        break;
      default:
        break;
    }
  });

  socket.connect(webSocketConnection);
}

async function createRTCPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);
  log("peer ", peerConnection);

  for (const track of localStream.getTracks()) {
    existingTracks.push(peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (evt) => {
    console.log("Received streams ", evt.streams);
    document.getElementById("remote-video").srcObject = event.streams[0];
  };

  peerConnection.ondatachannel = (evt) => {
    log("Received data channel ", evt.channel);
  };

  peerConnection.onicecandidate = (evt) => {
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

  peerConnection.onicegatheringstatechange = (evt) => {
    log("ICE Candidate gathering state ", evt);
  };

  peerConnection.onicecandidateerror = (err) => {
    log("ICE candidate error ", err);
  };

  peerConnection.onconnectionstatechange = (evt) => {
    log("Connection state changed ", peerConnection);
    if (peerConnection.connectionState === "connected") {
      localStream.getTracks().forEach(function (track, index) {
        console.log("tracks ", track, "senders ", peerConnection.getSenders());
        // peerConnection.addTrack(track, localStream);
        // peerConnection.getSenders().find(function (s) {
        //   console.log('sender ', s)
        //   if (s.track.kind == track.kind) {
        //     s.replaceTrack(track);
        //   }
        // });
      });
    } else if (peerConnection.connectionState === "disconnected") {
      log("disconnected ");
    }
  };

  peerConnection.onsignalingstatechange = (evt) => {
    log("signaling state changed ", evt, peerConnection);
  };

  // createAndSendOffer();
}

function resetTracks() {
   localStream.getTracks().forEach(function (track, index) {     
     peerConnection.addTrack(track, localStream);
     peerConnection.getSenders().find(function (s) {       
       if (s.track.kind == track.kind) {
         s.replaceTrack(track);
       }
     });
   });
}

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

function handleOffer(data) {
  console.log("handle offer ", data);
  remoteClientId = data.from;
  peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
}

function handleAnswer(data) {
  console.log("handle answer ", data);
  remoteClientId = data.from;
  peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
}

function handleCandidate(data) {
  // if(remoteClientId !== data.from)
  log("ICE Candidate received - ", data.candidate);
  peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));

  // activate button to create answer
}

function callUser(clientId) {
  if (channel) channel.close();

  channel = peerConnection.createDataChannel("chat-channel");

  createAndSendOffer(clientId);
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
