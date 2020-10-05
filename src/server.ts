import express, { Application } from "express";
import socketIO, { Server as SocketIOServer } from "socket.io";
import { createServer, Server as HTTPServer } from "https"
import path from "path"
import fs from 'fs'
import parser from "ua-parser-js";
import { Http2ServerRequest } from "http2";
const { uniqueNamesGenerator, animals, colors } = require('unique-names-generator');


/* 
{key: fs.readFileSync(path.join(__dirname, '/server.key'), 'utf-8'),
   cert: fs.readFileSync(path.join(__dirname, '/server.crt'), 'utf-8')
},
*/

class Peer {
    public socket;
    public id;
    public name;
    private ip;

    constructor(socket) {
        this.socket = socket;
        this.id = Peer.uuid();
        this.setName();
        this.setIp(this.socket.request);
    }

    getInfo() {
        return {
            id: this.id,
            name: this.name
        };
    }

    private setIp(request: Http2ServerRequest) {

        if (request.headers['x-forwarded-for']) {
            this.ip = request.headers['x-forwarded-for']
        } else {
            this.ip = request.connection.remoteAddress;
        }

        if (this.ip == '::1' || this.ip == '::ffff:127.0.0.1') {
            this.ip = '127.0.0.1';
        }
    }

    private setName() {

        const ua = parser(this.socket.request.headers['user-agent'])

        this.name = {
            model: ua.device.model,
            os: ua.os.name,
            browser: ua.browser.name,
            displayName: uniqueNamesGenerator({ length: 2, separator: ' ', dictionaries: [colors, animals], style: 'capital' }),
        };
    }

    static uuid() {
        let uuid = '',
            ii;
        for (ii = 0; ii < 32; ii += 1) {
            switch (ii) {
                case 8:
                case 20:
                    uuid += '-';
                    uuid += (Math.random() * 16 | 0).toString(16);
                    break;
                case 12:
                    uuid += '-';
                    uuid += '4';
                    break;
                case 16:
                    uuid += '-';
                    uuid += (Math.random() * 4 | 8).toString(16);
                    break;
                default:
                    uuid += (Math.random() * 16 | 0).toString(16);
            }
        }
        return uuid;
    };
}
export class Server {
    private httpServer: HTTPServer;
    private app: Application;
    private io: SocketIOServer;
    private activeSockets: Array<any> = []
    private users: any = {}
    private peers: any = {}

    private readonly DEFAULT_PORT = process.env.PORT || 8000;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer({
            key: fs.readFileSync(path.join(process.cwd(), '/server.key'), 'utf-8'),
            cert: fs.readFileSync(path.join(process.cwd(), '/server.crt'), 'utf-8')
        }, this.app);
        this.io = socketIO(this.httpServer);
        this.io.on('connection', (socket: any) => this.handleSocketConnection(new Peer(socket)))
        this.configureApp()
        this.handleRoutes()

    }

    private configureApp(): void {
        this.app.use(express.static(path.join(__dirname, '../frontend/public')))
    }

    private handleRoutes(): void {
        this.app.get("/", (req, res) => {
            res.send(`<h1>Hello World</h1>`);
        })        
    }

    private handleSocketConnection(peer: Peer): void {

        const existingSocket = this.activeSockets.find((existingSocket: any) => existingSocket.id === peer.id)

            if (!existingSocket) {
                this.peers[peer.id] = peer;
                this.activeSockets.push({ id: peer.id, });

                peer.socket.send({ name: peer.name.displayName, type: 'displayName' })

                peer.socket.on('disconnect', () => {
                    this.activeSockets = this.activeSockets.filter(existingSocket => existingSocket.id !== peer.id);

                    peer.socket.broadcast.emit('remove-user', { socketId: peer.id })
                })

                peer.socket.broadcast.emit('update-users-list', { users: [{ id: peer.id }] })

                peer.socket.emit('update-users-list', {
                    users: this.activeSockets.filter(existingSocket => existingSocket.id !== peer.id)
                })

                peer.socket.on('request', data => {

                    if (data.id) {
                        const receiver = this.peers[data.id];
                        // console.log('receiver ', receiver)
                        if (receiver)
                            receiver.emit('request', { ...data, from: peer.id, })
                    }
                })

            }
    }

    public listen(callback: (port: any) => void): void {
        console.log('port ', this.DEFAULT_PORT)
        this.httpServer.listen(this.DEFAULT_PORT, () => callback(this.DEFAULT_PORT))
    }
}