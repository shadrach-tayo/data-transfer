const log = console.log;

class Events {
  static fire(type, data) {
    return window.dispatchEvent(new CustomEvent(type, { detail: data }));
  }

  static on(type, callback) {
    // console.log("listen to ", type);
    return window.addEventListener(type, callback, false);
  }
}

class FileDigester {
  constructor(meta, callback) {
    this._meta = meta;
    this._name = meta.name;
    this._size = meta.size;
    this._type = meta.mime || "application/octet-stream";
    this._buffer = [];
    this._bytesReceived = 0;
    this.progress = 0;
    this._callback = callback;
  }

  unchunk(chunk) {
    log("Chunk ", chunk);
    this._buffer.push(chunk);
    this._bytesReceived += chunk.byteLength || chunk.size;

    this.progress = this._bytesReceived / this.size;

    if (this._bytesReceived < this._size) return; // tranfer note complete

    let blob = new Blob(this._buffer, { name: this._name, type: this._type });

    this._callback({ ...this._meta, blob });
    // package and send file to callback if totalChunk == size;
  }
}

export { FileDigester, Events };
