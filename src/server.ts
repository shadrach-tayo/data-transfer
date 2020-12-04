import express, { Application } from "express";
import socketIO, { Server as SocketIOServer } from "socket.io";
import { createServer, Server as HTTPServer } from "https";

import path from "path"
import fs from 'fs'
import parser from "ua-parser-js";
import { Http2ServerRequest } from "http2";
const { uniqueNamesGenerator, animals, colors } = require('unique-names-generator');


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
    connectedRooms: string[] = [];


    constructor(socket) {
        this.socket = socket;
        this.id = Peer.uuid();
        this.setName();
        this.setIp(this.socket.request);
    }

    getInfo() {
        return this.name
    }

    getIp() {
        return this.ip;
    }

    removeRoom(roomKey: string) {
        this.connectedRooms = this.connectedRooms.filter(key => key != roomKey);
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
        this.ip = hash(this.ip);
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

    private readonly DEFAULT_PORT = 8000;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.app = express();
        this.httpServer = createServer(
            /* {
            key: fs.readFileSync(path.join(process.cwd(), '/server.key'), 'utf-8'),
            cert: fs.readFileSync(path.join(process.cwd(), '/server.crt'), 'utf-8')
        },*/
            this.app);
        this.configureApp()
        this.handleRoutes()

        this.io = socketIO(this.httpServer);
        this.io.on('connection', (socket: any) => this.handleSocketConnection(new Peer(socket)))
    }

    private configureApp(): void {
        this.app.use(express.static(path.join(__dirname, '../frontend/public')))
        // setInterval(() => this.notifyDevices(), 3000)
    }

    private handleRoutes(): void {
        this.app.get("/", (req, res) => {
            res.send(`<h1>Hello World</h1>`);
        })
    }

    locateHostPeer(key, type: string = 'name') {
        let peer;
        if (type.includes('name')) {
            // find peer by name and return peer
            for (const otherPeerId in this.peers) {                
                let otherPeer = this.peers[otherPeerId];
                if (otherPeer.getInfo().displayName.toLowerCase() === key.toLowerCase()) {
                    peer = otherPeer;
                    break;
                }
            }

        } else if (type.includes('id')) {
            // find peer by id and return peer
            peer = this.peers.find(otherPeer => otherPeer.id === key)
        }
        return peer;
    }

    notifyDevices() {
        const locations = {};

        for (const id in this.peers) {
            let peer = this.peers[id];
            locations[peer.hashedIp] = locations[peer.hashedIp] || [];
            locations[peer.hashedIp].push({ socket: peer.socket, name: peer.name })
        }        

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
                let msg = { buddies, type: 'peers' }
                let currState = hash(JSON.stringify(buddies))
                if (currState != socket.laststate) {
                    socket.send(msg);
                    socket.laststate = currState;
                }
            })
        })
    }

    private handleSocketConnection(peer: Peer): void {

        this.createRooms(peer);
        this.joinRoom(peer, peer.getIp(), 'peers');

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
            case 'connect-peer':
                const remotePeer = this.locateHostPeer(message.host, message.hostType)
                this.connectToPeer(sender, remotePeer)
                break;
        }

        const keyOptions = [sender.ip].concat(sender.connectedRooms);

        for (const roomKey of keyOptions) {
            if (message.to && this.rooms[roomKey]) {
                let data = { ...message }
                if (!this.rooms[roomKey][message.to]) continue;
                let recipientId = message.to;
                let recipient = this.rooms[roomKey][recipientId];

                delete data.to;
                data.sender = sender.id;
                if (recipient) {
                    this.send(recipient, data)
                }
            }
        }

    }

    forEachKey(keys, fn) {
        keys.forEach(key => fn(key))
    }


    send(peer, message) {
        if (!peer) return;
        // check if io is connected or abort
        peer.socket.send(message)
    }

    private connectToPeer(hostPeer, remotePeer) {
        // notify remote peer if host peer is not found/online on the server
        if (!remotePeer) return this.send(hostPeer, { type: 'CONNECT_PEER_ERROR', message: 'The user you\'re trying to connect is offline' })

        // prevent peers of the same ip from connecting
        if (hostPeer.ip === remotePeer.ip) return this.send(hostPeer, { type: 'CONNECT_PEER_ERROR', message: 'User is on the same network' })

        // send new peer info to existing peers
        this.notifiyOtherPeers({ peerInfo: remotePeer.getInfo(), key: hostPeer.id })

        // notify peer about the other peers
        const otherPeers = [];
        for (const otherPeerId in this.rooms[hostPeer.id]) {
            otherPeers.push(this.rooms[hostPeer.id][otherPeerId].getInfo());
        }

        // notify host peer about remote peer
        this.send(remotePeer, { type: 'connect-peers', peers: otherPeers });

        // add new peer to the room
        this.rooms[hostPeer.id][remotePeer.id] = remotePeer;

        // add roomKey to peers connectedRooms
        if (!hostPeer.connectedRooms.includes(hostPeer.id)) hostPeer.connectedRooms.push(hostPeer.id)
        if (!remotePeer.connectedRooms.includes(hostPeer.id)) remotePeer.connectedRooms.push(hostPeer.id)


    }

    private createRooms(peer) {
        if (!this.rooms[peer.id]) {
            this.rooms[peer.id] = {}
            this.rooms[peer.id][peer.id] = peer;
        }
        if (!this.rooms[peer.ip]) {
            this.rooms[peer.ip] = {}
            // this.rooms[peer.ip][peer.ip] = peer
        }
    }


    private joinRoom(peer, key = peer.ip, type) {
        if (!this.peers[peer.id]) {
            this.peers[peer.id] = peer;
        }        

        // notify peer of other peers
        this.notifiyOtherPeers({ peerInfo: peer.getInfo(), key })


        // notify peer about the other peers
        const otherPeers = [];
        for (const otherPeerId in this.rooms[key]) {
            otherPeers.push(this.rooms[key][otherPeerId].getInfo());
        }
        this.send(peer, {
            type,
            peers: otherPeers
        });


        this.rooms[key][peer.id] = peer;

        // add roomKey to peer's maintained list of connected rooms
        if (!peer.connectedRooms.includes(key)) peer.connectedRooms.push(key);
    }

    notifiyOtherPeers({ peerInfo, key }) {
        // notify peer of other peers
        for (const otherPeerId in this.rooms[key]) {
            let otherPeer = this.rooms[key][otherPeerId]
            // console.log('peer-joined ', peerInfo, otherPeer.getInfo())
            this.send(otherPeer, { type: 'peer-joined', peer: peerInfo })
        }
    }

    private leaveRoom(peer) {
        // using peer's connected room to detect peer's cuurent active rooms
        for (const roomKey of peer.connectedRooms) {
            if (!this.rooms[roomKey] || !this.rooms[roomKey][peer.id]) return;

            delete this.rooms[roomKey][peer.id];
            peer.socket.disconnect();
            delete this.peers[peer.id];

            if (!Object.keys(this.rooms[roomKey]).length) {
                delete this.rooms[roomKey]
                delete this.peers[peer.id];
            } else {
                for (const id in this.rooms[roomKey]) {
                    let otherPeer = this.rooms[roomKey][id];
                    this.send(otherPeer, { type: 'peer-left', peerId: peer.id })
                }
            }

            peer.removeRoom(roomKey);
        }

    }

    public listen(callback: (port: any) => void): void {        
        this.httpServer.listen(this.DEFAULT_PORT, () => callback(this.DEFAULT_PORT))
    }
};