const haiku = require('./haiku');

const users = {};

async function randomID() {
    let id = haiku();
    while (id in users) {
        await delay(5);
        id = haiku();
    }
    return id;
}

function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    })
}

exports.createUser = async (socket) => {
    const id = await randomID();
    users[id] = socket;
    return id;
}

exports.getUser = (id) => users[id];

exports.removeUser = (id) => (delete users[id]);