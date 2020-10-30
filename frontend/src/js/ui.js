import { Events } from "./utils";
const log = console.log;
const isURL = (text) => /^((https?:\/\/|www)[^\s]+)/g.test(text.toLowerCase());

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
  }
}

class ReceiveFileDialog extends Dialog {
  constructor() {
    super("receiveDialog");
    this._fileQueue = [];
    Events.on("file-received", (e) => this._newFile(e.detail));
  }

  hide() {
    super.hide();
    this._deQueueFile();
  }

  _newFile(file) {
    // log("Dialog: file", , this._busy);
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
    }, 400);
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
    this.$text = this.$el.querySelector("#text");
    this.$el
      .querySelector("#copy")
      .addEventListener("click", (e) => this._onCopyText());
    Events.on("receive-text", (e) => this._onNewText(e.detail));
  }

  _onNewText(text) {
    this.$text.innerHTML = "";
    if (isURL(text)) {
      let a = document.createElement("a");
      a.href = text;
      a.textContent = text;
      a.target = "_blank";
      this.$text.appendChild(a);
    } else {
      this.$text.textContent = text;
    }
    this.show();
  }

  _onCopyText() {
    try {
      navigator.clipboard
        .writeText(this.$text.textContent)
        .then((val) => {
          log("copied text", this.$text.textContent);
          this.hide();
          // display toast
        })
        .catch((err) => {
          if (document.copyText(this.$text.textContent)) {
            // notify user
          }
          this.hide();
        });
    } catch (e) {
      if (document.copyText(this.$text.textContent)) {
        // notify user
      }
      this.hide();
    }
  }
}

class SendTextDialog extends Dialog {
  constructor() {
    super("sendText");
    this.$text = this.$el.querySelector("#input-text");
    this.$form = this.$el.querySelector("#sendTextForm");
    this.$form.addEventListener("submit", (e) => this._onSendText(e));
    Events.on("new-text", (e) => this._onNewText(e.detail));
  }

  _onNewText(receipient) {
    log("open sender: ", receipient);
    this._receipient = receipient;
    this.show();
    this.$text.setSelectionRange(0, this.$text.value.length);
  }

  _onSendText(e) {
    e.preventDefault();
    Events.fire("send-text", {
      to: this._receipient,
      text: this.$text.value,
    });
    this.hide();
  }
}

export { ReceiveFileDialog, ReceiveTextDialog, SendTextDialog };

document.copyText = (text) => {
  const span = document.createElement("span");
  span.textContent = text;

  span.style.position = "absolute";
  span.style.top = "-99999px";
  span.style.left = "-99999px";

  window.document.body.appendChild(span);

  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(range);

  let copied = false;
  try {
    copied = document.execCommand("copy");
    log("copied ", copied);
  } catch (e) {}

  selection.removeAllRanges();
  span.remove();

  return copied;
};
