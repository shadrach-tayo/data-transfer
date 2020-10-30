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
    this._buffer.push(chunk);
    this._bytesReceived += chunk.byteLength || chunk.size;

    this.progress = this._bytesReceived / this._size;
    log("progress ", this._bytesReceived, this._size);

    if (this._bytesReceived < this._size) return; // tranfer note complete

    let blob = new Blob(this._buffer, { name: this._name, type: this._type });

    this._callback({ ...this._meta, blob });
    // package and send file to callback if totalChunk == size;
  }
}

class FileSender {
  constructor(file, onChunk, callback) {
    this._file = file;
    this._onChunk = onChunk;
    this._callback = callback;
    this.reader = new FileReader();
    this.reader.onload = (e) => this._sendChunk(e.target.result);
    this._maxPacketSize = 1e6;
    this._chunkSize = 64000; // 64 kb
    this._offset = 0;
    this.totalBytesSent = 0;
  }

  _sendChunk(chunk) {
    this._offset += chunk.byteLength; // increment offset
    this._partitionSize += chunk.byteLength;

    this._onChunk(chunk); // send chunk

    if (this.isFileEnd() || this.isPartitionEnd()) {
      // call callback if chunk is finished sending
      this._callback(this._offset);
      return;
    }

    this._readChunk();
  }

  nextPartition() {
    this._partitionSize = 0;
    this._readChunk();
  }

  repeatPartition() {
    this._offset -= this._partitionSize;
    this.nextPartition();
  }

  _readChunk() {
    // write logic to load next chunk from file
    let chunk = this._file.slice(this._offset, this._offset + this._chunkSize);
    this.reader.readAsArrayBuffer(chunk);
  }

  isPartitionEnd() {
    return this._partitionSize >= this._maxPacketSize;
  }

  isFileEnd() {
    return this._offset >= this._file.size;
  }
}

export { FileDigester, FileSender, Events };
