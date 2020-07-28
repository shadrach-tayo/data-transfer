import express, { Application } from "express";
import socketIO, { Server as SocketIOServer } from "socket.io";
import { createServer, Server as HTTPServer } from "http"
import path from "path"


export class Server {
    private httpServer: HTTPServer;
    private app: Application;
    private io: SocketIOServer;
    private activeSockets: any[] = [];

    private readonly DEFAULT_PORT = 8000;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = socketIO(this.httpServer);

        this.configureApp()
        this.handleRoutes()
        this.handleSocketConnection();
    }

    private configureApp(): void {
        this.app.use(express.static(path.join(__dirname, '../public')))
    }

    private handleRoutes(): void {
        this.app.get("/", (req, res) => {
            res.send(`<h1>Hello World</h1>`);
        })
    }

    private handleSocketConnection(): void {
        this.io.on('connection', socket => {
            console.log("Socket connected.")
            const existingSocket = this.activeSockets.find((existingSocket: any) => existingSocket.id == socket.id)

            if (!existingSocket) {
                this.activeSockets.push(socket);

                socket.emit('update-users-list', {
                    users: this.activeSockets.filter(existingSocket => existingSocket.id != socket.id)
                })

                socket.on('disconnect', () => {
                    this.activeSockets = this.activeSockets.filter(existingSocket => existingSocket !== socket.id);

                    socket.broadcast.emit('remove-user', { socketId: socket.id })
                })

                socket.broadcast.emit('update-users-list', { users: [socket.id] })
            }
        })
    }

    public listen(callback: (port: number) => void): void {
        this.httpServer.listen(this.DEFAULT_PORT, () => callback(this.DEFAULT_PORT))
    }
}