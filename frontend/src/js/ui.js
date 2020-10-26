import { Events } from "./utils";
const log = console.log;

class Dialog {
  constructor(id) {
    this.$el = document.getElementById(id);
    this.$el
      .querySelector("[close]")
      .addEventListener("click", (e) => this.hide());
    this.$autoFocus = document.querySelector("[autoFocus]");
  }

  show() {
    this.$el.setAttribute("show", 1);
    if (this.$autoFocus) this.$autoFocus.focus();
  }

  hide() {
    this.$el.removeAttribute("show");
    this._deQueueFile();
  }
}

class ReceiveFileDialog extends Dialog {
  constructor() {
    super("receiveDialog");
    this._fileQueue = [];
    Events.on("file-received", (e) => this._newFile(e.detail));
  }

  _newFile(file) {
    log("Dialog: file", file, this._busy);
    // play notification sound
    if (file) this._fileQueue.push(file);

    if (this._busy) return;
    this._busy = true;
    let nextFile = this._fileQueue.shift();
    this._displayFile(nextFile);
  }

  _deQueueFile() {
    if (!this._fileQueue.length) {
      this._busy = false;
      return;
    }

    // schedule next file
    setTimeout(() => {
      this._busy = false;
      this._newFile();
    });
  }

  _displayFile(file) {
    this.$a = this.$el.querySelector("#download");
    const url = URL.createObjectURL(file.blob);
    this.$a.href = url;
    this.$a.download = file.name;
    this.show();

    this.$el.querySelector("#fileName").textContent = file.name;
    this.$el.querySelector("#size").textContent = this._getFileSize(file.size);

    // if download isn't supported use file reader to create data url and set as download link
  }

  _getFileSize(bytes) {
    if (bytes >= 1e9) {
      return Math.round(bytes / 1e8) / 10 + " GB";
    } else if (bytes >= 1e6) {
      return Math.round(bytes / 1e5) / 10 + " MB";
    } else if (bytes > 1000) {
      return Math.round(bytes / 1000) + " KB";
    } else {
      return bytes + " Bytes";
    }
  }
}

class ReceiveTextDialog extends Dialog {
  constructor() {
    super("receiveText");
  }
}

class SendTextDialog extends Dialog {
  constructor() {
    super("sendText");
  }
}

export { ReceiveFileDialog, ReceiveTextDialog, SendTextDialog };
