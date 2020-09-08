var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const haiku = require('./haiku');
const users = {};
function randomID() {
    return __awaiter(this, void 0, void 0, function* () {
        let id = haiku();
        while (id in users) {
            yield delay(5);
            id = haiku();
        }
        return id;
    });
}
function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
exports.createUser = (socket) => __awaiter(this, void 0, void 0, function* () {
    const id = yield randomID();
    users[id] = socket;
    return id;
});
exports.getUser = (id) => users[id];
exports.removeUser = (id) => (delete users[id]);
//# sourceMappingURL=users.js.map