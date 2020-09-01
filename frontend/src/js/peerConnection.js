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
        console.log('type ', track, on)
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

export default PeerConnection;
