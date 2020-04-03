'use strict';
let https = require("https");
let http = require("http");
let url = require("url");

exports.parse = {
    connectionDetails:{
        firstConnect: true,
        globallyBanned: false,
    },
    actionUrl: url.parse("https://play.pokemonshowdown.com/~~" + Config.info.serverid + "/action.php"),
    parseData: function(data) {
        if (data.charAt(0) !== "a") return false;
        data = JSON.parse(data.slice(1));
        if (data instanceof Array) {
            for (let i = 0, len = data.length; i < len; i++) {
                this.receive(data[i]);
            }
        }
        else {
            this.receive(data);
        }
    },
    receive: function(entry) {
        if (!entry) return false;
        let roomid = "lobby";
        let initMessage = false;
        entry.split("\n").forEach(e => {
            if (e.charAt(0) === ">") roomid = toId(e, true);
            if (e.includes("|") && ((initMessage && ["users", "title"].includes(e.split("|")[1])) || !initMessage)) {
                if (e.split("|")[1] === "init") initMessage = true;
                this.parse(roomid, e);
            }
        });
    },
    parse: function(room, entry) {
        if (!room || !entry) return false;
        log("<<", ">" + room + entry);
        room = Rooms.get(room);
        let parts = entry.split("|");
        let user, message;
        Events.onEvent(room, parts[1], parts.slice(2).join("|"));
        switch (parts[1]) {
            case "challstr":
                this.challstr = parts.slice(2);
                this.login(Config.bot.name, Config.bot.pass);
                break;
            case "updateuser":
                log("ok", (toId(parts[2]) !== toId(Monitor.username) ? (toId(parts[2]).slice(0, 5) === "guest" ? "Connected as " : "Logged in as ") : "Renamed to ") + parts[2]);
                Monitor.username = parts[2];
                if (toId(parts[2]).slice(0, 5) === "guest" || !this.connectionDetails.firstConnect) break;
                Object.keys(Db("autojoin").cache).forEach(r => {
                    if (!Rooms.rooms.has(r) || r === "lobby") send("|/join " + r);
                });
                this.connectionDetails.firstConnect = false;
                break;
            case "nametaken":
                log("monitor", "ForceRenamed; attempting to log back in.");
                this.login(Config.bot.name, Config.bot.pass);
                break;
            case "users":
                room.buildUserList(parts[2]);
                break;
            case "title":
                room.name = parts[2];
                log("join", toId(room.name) === toId(room.id) ? room.name : room.name + " - (" + room.id + ")");
                break;
            case "c":
                message = parts.slice(3).join("|");
                if (toId(parts[2])) {
                    user = Users.get(parts[2]);
                    user.update(room, parts[2]);
                    room.moderate(user, message);
                    commandParser(message, user, room, !Config.monitorDefault);
                }
                break;
            case "c:":
                user = Users.get(parts[3]);
                message = parts.slice(4).join("|");
                user.update(room, parts[3]);
                room.moderate(user, message);
                commandParser(message, user, room, !Config.monitorDefault);
                break;
            case "pm":
                let pmUsername = parts[2];
                message = parts.slice(4).join("|");
                if (toId(pmUsername) === toId(Monitor.username)) return;
                user = Users.get(pmUsername);
                user.updateGlobalRank(pmUsername.charAt(0));
                if (message.indexOf("/invite ") === 0 && user.isStaff) {
                    send("|/join " + message.slice(8));
                }
                commandParser(message, user, null, false);
                if (!Config.defaultCharacter.includes(message.charAt(0)) && Config.pmMessage && !user.pmMessageSent) {
                    user.pmMessageSent = true;
                    user.sendTo(Config.pmMessage);
                }
                break;
            case "j":
            case "J":
                room.userJoin(parts[2]);
                break;
            case "L":
            case "l":
                room.userLeave(parts[2]);
                break;
            case "n":
            case "N":
                room.userRename(toId(parts[3]), parts[2]);
                break;
            case "noinit":
            case "deinit":
                if (room.name === "global") {
                    log("monitor", "Banned from server (left room global).")
                    this.connectionDetails.globallyBanned = true;
                }
                if(this.connectionDetails.globallyBanned) break;
                log("left", room.name);
                Rooms.delete(room.id);
                break;
            case "init":
                Rooms.autojoin(room.id);
                break;
        }
    },
    login: function(nick, pass) {
        if (toId(nick) === toId(Monitor.username)) return send("|/trn " + nick);
        let id = this.challstr[0];
        let str = this.challstr[1];
        let requestOptions = {
            hostname: this.actionUrl.hostname,
            port: this.actionUrl.port,
            path: this.actionUrl.pathname,
            agent: false
        };

        let data;
        if (!pass) {
            requestOptions.method = 'GET';
            requestOptions.path += '?act=getassertion&userid=' + toId(nick) + '&challengekeyid=' + id + '&challenge=' + str;
        }
        else {
            requestOptions.method = 'POST';
            data = 'act=login&name=' + nick + '&pass=' + pass + '&challengekeyid=' + id + '&challenge=' + str;
            requestOptions.headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': data.length
            };
        }

        let req = http.request(requestOptions, res => {
            res.setEncoding('utf8');
            data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                if (data === ';') {
                    log("error", 'failed to log in; nick is registered - invalid or no password given');
                }
                if (data.length < 50) {
                    log("error", 'failed to log in: ' + data);
                }

                if (data.indexOf('heavy load') !== -1) {
                    log("error", 'the login server is under heavy load; trying again in one minute');
                    setTimeout(() => {
                        this.login(nick, pass);
                    }, 60 * 1000);
                    return;
                }

                if (data.substr(0, 16) === '<!DOCTYPE html>') {
                    log("error", 'Connection error 522; trying agian in one minute');
                    setTimeout(() => {
                        this.login(nick, pass);
                    }, 60 * 1000);
                    return;
                }

                try {
                    data = JSON.parse(data.substr(1));
                    if (data.actionsuccess) {
                        data = data.assertion;
                    }
                    else {
                        log("error", 'could not log in; action was not successful: ' + JSON.stringify(data));
                        process.exit(-1);
                    }
                }
                catch (e) {}
                send('|/trn ' + toId(nick) + ',0,' + data);
                if (toId(nick) !== nick) {
                    send("|/trn " + nick, nick);
                }
            });
        });

        req.on('error', err => {
            log("error", 'login error: ' + err.stack);
        });

        if (data) req.write(data);
        req.end();
    },
};
