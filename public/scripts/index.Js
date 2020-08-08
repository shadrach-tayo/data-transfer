const { RTCPeerConnection, RTCSessionDescription } = window;

let socket,
  localStream,
  existingTracks = [],
  peerConnection,
  channel;

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

// getUserMedia();

function connectToWebSocket() {
  socket = io({ transports: ["websocket"] });

  socket.on("connect", () => {
    console.log("socket connected ", socket.connected);
    createRTCPeerConnection();
  });

  socket.on("open", () => {
    console.log("socket connection opened ", socket);
  });

  socket.on("reconnect_attempt", () => {
    console.log("reconnect ");
    socket.io.opts.transports = ["polling", "websocket"];
  });

  socket.on("error", (error) => {
    console.log(" socket connection error ", error);
  });

  socket.on("close", (evt) => {
    console.log("Web socket connection closed ", evt);
  });

  socket.on("disconnect", (evt) => {
    console.log(" socket disconnected ", !socket.connected);
  });

  socket.on("message", (evt) => {
    console.log("socket message received ", evt);
  });

  socket.on("update-users-list", ({ users }) => {
    console.log("update users ", users);
    updateUserList(users);
  });

  socket.on("remove-user", ({ socketId }) => {
    console.log("remove user ", socketId);
  });

  // Handle messages recieved in socket
  socket.on('request', function (data) {
    jsonData = event.data;
    console.log('requst ', data);
    switch (jsonData.type) {
      case "candidate":
        handleCandidate(jsonData.data, jsonData.id);
        break;
      case "offer":
        handleOffer(jsonData);
        break;
      case "answer":
        handleAnswer(jsonData.data, jsonData.id);
        break;
      default:
        break;
    }
  });

  socket.connect(webSocketConnection);
}

async function createRTCPeerConnection() {
  console.log("creating RTCPeerConnection");
  peerConnection = new RTCPeerConnection(configuration);

  log("peer ", peerConnection);

  peerConnection.addEventListener("connectionstatechange", (evt) => {
    log("Connection state changed ", evt, peerConnection);
  });

  peerConnection.ontrack = (evt) => {
    console.log("Received streams ", evt.streams);
  };

  peerConnection.ondatachannel = (evt) => {
    log("Received data channel ", evt.channel);
  };

  peerConnection.onicecandidate = (evt) => {
    log("ICE Candidate received ", evt.candidate);
  };

  peerConnection.onicegatheringstatechange = (evt) => {
    log("ICE Candidate gathering state ", evt);
  };

  peerConnection.onicecandidateerror = (err) => {
    log("ICE candidate error ", err);
  };

  peerConnection.onconnectionstatechange = (evt) => {
    log("Connection state changed ", peerConnection);
  };

  peerConnection.onsignalingstatechange = (evt) => {
    log("signaling state changed ", evt, peerConnection);
  };

  // createAndSendOffer();
}

function createAndSendOffer(clientId) {
  peerConnection
    .createOffer({ offerToReceiveAudio: 1 })
    .then((offer) => {
      log("offer ", offer);

      socket.emit('request', { id: clientId, data: offer, type: "offer" })

      // set offer description
      peerConnection.setLocalDescription(offer);
    })
    .catch((err) => log("error creating offer ", err));
}

function handleOffer(data) {
  console.log('handle offer ', data);
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
