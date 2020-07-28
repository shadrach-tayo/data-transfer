let socket;
const webSocketConnection = "ws://localhost:8000";

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(
  function (stream) {
    const localVideo = document.getElementById("local-video");

    if (localVideo) {
      localVideo.srcObject = stream;
      connectToWebSocket();
    }
  },
  (error) => {
    console.log("error ", error);
  }
);

function connectToWebSocket() {
  socket = new WebSocket(webSocketConnection);  

  socket.addEventListener("open", (evt) => {
    console.log("Web socket connection opened ", evt);
  });

  // socket.onopen(evt => {
  // })

  socket.addEventListener("error", (evt) => {
    console.log("Web socket connection error ", evt);
  });

  socket.addEventListener("close", (evt) => {
    console.log("Web socket connection closed ", evt);
  });
}
