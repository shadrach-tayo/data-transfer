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


function hash(text) {
    // A string hashing function based on Daniel J. Bernstein's popular 'times 33' hash algorithm.
    var h = 5381,
        index = text.length;
    while (index) {
        h = (h * 33) ^ text.charCodeAt(--index);
    }
    return h >>> 0;
}

class Peer {
    socket: any;
    id: string;
    name: any;
    hashedIp: number;
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

        this.hashedIp = hash(this.ip);
    }

    private setName() {

        const ua = parser(this.socket.request.headers['user-agent'])

        this.name = {
            id: this.id,
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
    private rooms: any = {}
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
        this.configureApp()
        this.handleRoutes()

        this.io = socketIO(this.httpServer);
        this.io.on('connection', (socket: any) => this.handleSocketConnection(new Peer(socket)))
    }

    private configureApp(): void {
        this.app.use(express.static(path.join(__dirname, '../frontend/public')))
        setInterval(() => this.notifyDevices(), 3000)
    }

    private handleRoutes(): void {
        this.app.get("/", (req, res) => {
            res.send(`<h1>Hello World</h1>`);
        })
    }

    notifyDevices() {
        const locations = {};

        for (const id in this.peers) {
            let peer = this.peers[id];
            locations[peer.hashedIp] = locations[peer.hashedIp] || [];
            locations[peer.hashedIp].push({ socket: peer.socket, name: peer.name })
        }
        // console.log('notifiy buddies ', locations)

        Object.keys(locations).forEach(ip => {
            let location = locations[ip]

            location.forEach(peer => {
                let buddies = location.reduce((result, otherPeer) => {
                    if (otherPeer.name.id != peer.name.id) {
                        result.push(otherPeer.name)
                    }
                    return result;
                }, [])

                let socket = peer.socket;
                let msg = { buddies, type: 'buddies' }
                let currState = hash(JSON.stringify(buddies))
                if (currState != socket.laststate) {
                    socket.send(msg);
                    socket.laststate = currState;
                }
            })
        })
    }

    private handleSocketConnection(peer: Peer): void {
        // console.log('connect ', peer.id)

        this.joinRoom(peer);

        peer.socket.send({ name: peer.name.displayName, type: 'displayName' })

        peer.socket.on('disconnect', () => this.leaveRoom(peer))

        peer.socket.on('message', (message) => this.onMessage(peer, message))        

    }

    private onMessage(sender, message) {
        if (!sender) return;

        switch (message.type) {
            case 'disconnect':
                this.leaveRoom(sender);
                break;
        }

        if (message.to && sender.ip) {
            let recipientId = message.to;
            let recipient = this.rooms[sender.ip][recipientId];

            delete message.to;
            message.sender = sender.id;
            if (recipient) {
                // console.log('send message ', message.sender)
                this.send(recipient, message)
            }
        }
    }

    send(peer, message) {
        if (!peer) return;
        // check if io is connected or abort
        peer.socket.send(message)
    }

    private joinRoom(peer) {
        if (!this.peers[peer.id]) {
            this.peers[peer.id] = peer;
        }

        if (!this.rooms[peer.ip]) {
            this.rooms[peer.ip] = {};
        }

        this.rooms[peer.ip][peer.id] = peer;
    }

    private leaveRoom(peer) {
        if (!this.rooms[peer.ip] || !this.rooms[peer.ip][peer.id]) return;

        delete this.rooms[peer.ip][peer.id];
        peer.socket.disconnect();
        delete this.peers[peer.id];

        if (!Object.keys(this.rooms[peer.ip]).length) {
            delete this.rooms[peer.ip]
            delete this.peers[peer.id];
        } else {
            for (const id in this.rooms[peer.ip]) {
                let otherPeer = this.rooms[peer.ip][id];
                this.send(otherPeer, { type: 'peer-left', peerId: peer.id })
            }
        }
    }

    public listen(callback: (port: any) => void): void {
        console.log('port ', this.DEFAULT_PORT)
        this.httpServer.listen(this.DEFAULT_PORT, () => callback(this.DEFAULT_PORT))
    }
}