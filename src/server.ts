import express, { Application } from "express";
import socketIO, { Server as SocketIOServer } from "socket.io";
import { createServer, Server as HTTPServer } from "https"
import path from "path"
import fs from 'fs'


export class Server {
    private httpServer: HTTPServer;
    private app: Application;
    private io: SocketIOServer;
    private activeSockets: Array<any> = []
    private users: any = {}

    private readonly DEFAULT_PORT = 8000;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer({
            key: fs.readFileSync(path.join(__dirname, '/server.key'), 'utf-8'),
            cert: fs.readFileSync(path.join(__dirname, '/server.crt'), 'utf-8')
        }, this.app);
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
        this.io.on('connection', (socket: any) => {
            console.log("Socket connected. ", socket.id)
            const existingSocket = this.activeSockets.find((existingSocket: any) => existingSocket.id === socket.id)

            if (!existingSocket) {
                this.users[socket.id] = socket;
                this.activeSockets.push({ id: socket.id, });


                socket.on('disconnect', () => {
                    this.activeSockets = this.activeSockets.filter(existingSocket => existingSocket.id !== socket.id);

                    socket.broadcast.emit('remove-user', { socketId: socket.id })
                })

                socket.broadcast.emit('update-users-list', { users: [{ id: socket.id }] })

                socket.emit('update-users-list', {
                    users: this.activeSockets.filter(existingSocket => existingSocket.id !== socket.id)
                })

                socket.on('request', data => {

                    if (data.id) {
                        const receiver = this.users[data.id];
                        console.log('receiver ', receiver)
                        if (receiver)
                            receiver.emit('request', { ...data, from: socket.id, })
                        

                    }
                })

            }
        })
    }

    public listen(callback: (port: number) => void): void {
        this.httpServer.listen(this.DEFAULT_PORT, () => callback(this.DEFAULT_PORT))
    }
}