"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const express_1 = __importDefault(require("express"));
const socket_io_1 = __importDefault(require("socket.io"));
const https_1 = require("https");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/*
{
            key: fs.readFileSync(path.join(__dirname, '/server.key'), 'utf-8'),
            cert: fs.readFileSync(path.join(__dirname, '/server.crt'), 'utf-8')
        },
        */
class Server {
    constructor() {
        this.activeSockets = [];
        this.users = {};
        this.DEFAULT_PORT = process.env.PORT || 8080;
        this.initialize();
    }
    initialize() {
        this.app = express_1.default();
        this.httpServer = https_1.createServer({
            key: fs_1.default.readFileSync(path_1.default.join(process.cwd(), '/server.key'), 'utf-8'),
            cert: fs_1.default.readFileSync(path_1.default.join(process.cwd(), '/server.crt'), 'utf-8')
        }, this.app);
        this.io = socket_io_1.default(this.httpServer);
        this.configureApp();
        this.handleRoutes();
        this.handleSocketConnection();
    }
    configureApp() {
        this.app.use(express_1.default.static(path_1.default.join(__dirname, '../frontend/public')));
    }
    handleRoutes() {
        this.app.get("/", (req, res) => {
            res.send(`<h1>Hello World</h1>`);
        });
    }
    handleSocketConnection() {
        this.io.on('connection', (socket) => {
            // console.log("Socket connected. ", socket.id)
            const existingSocket = this.activeSockets.find((existingSocket) => existingSocket.id === socket.id);
            if (!existingSocket) {
                this.users[socket.id] = socket;
                this.activeSockets.push({ id: socket.id, });
                socket.on('disconnect', () => {
                    this.activeSockets = this.activeSockets.filter(existingSocket => existingSocket.id !== socket.id);
                    socket.broadcast.emit('remove-user', { socketId: socket.id });
                });
                socket.broadcast.emit('update-users-list', { users: [{ id: socket.id }] });
                socket.emit('update-users-list', {
                    users: this.activeSockets.filter(existingSocket => existingSocket.id !== socket.id)
                });
                socket.on('request', data => {
                    if (data.id) {
                        const receiver = this.users[data.id];
                        // console.log('receiver ', receiver)
                        if (receiver)
                            receiver.emit('request', Object.assign(Object.assign({}, data), { from: socket.id }));
                    }
                });
            }
        });
    }
    listen(callback) {
        this.httpServer.listen(this.DEFAULT_PORT, () => callback(this.DEFAULT_PORT));
    }
}
exports.Server = Server;
//# sourceMappingURL=server.js.map