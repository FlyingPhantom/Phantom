'use strict';
let Rooms = {};
let rooms = Rooms.rooms = new Map();

class Room {
    constructor(roomname) {
        this.id = toId(roomname, true);
        this.users = new Map();
        this.name = roomname;
        this.warnings = {};
        this.commandCharacter = Db("settings").get([this.id, "rch"], Config.defaultCharacter.slice(0));
        this.blacklist = Db("blacklist").get(this.id, {});
        this.userData = {};
        this.isPrivate = Db("settings").get([this.id, "isPrivate"], false);
        this.init();
    }

    init() {
        this.timer = setInterval(() => {
            for (let name in this.userData) {
                if (this.userData[name].demerits === 0) continue;
                let points = this.userData[name].demerits - 1;
                //maybe not really needed
                points = points < 0 ? 0 : points;
                this.userData[name].demerits = points;
            }
        }, 900000);
    }

    end() {
        //safely delete the room without causing issues with setInterval
        clearInterval(this.timer);
        if (this.game) this.game.destroy();
        if (this.countdown) this.countdown.destroy();
    }

    blacklistUser(userid) {
        this.blacklist[userid] = 1;
        Db("blacklist").set(this.id, this.blacklist);
    }

    unblacklistUser(userid) {
        delete this.blacklist[userid];
        Db("blacklist").set(this.id, this.blacklist);
    }

    userIsBlacklisted(userid) {
        if (userid in this.blacklist) return true;
        return false;
    }

    addCommandCharacter(char) {
        this.commandCharacter.push(char);
        Db("settings").set([this.id, "rch"], this.commandCharacter);
    }

    removeCommandCharacter(char) {
        this.commandCharacter.splice(this.commandCharacter.indexOf(char), 1);
        Db("settings").set([this.id, "rch"], this.commandCharacter);
    }

    buildUserList(list) {
        //|users|2,+sparkyboTTT,#sparkychild
        list = list.split(",").slice(1);
        list.forEach(u => {
            this.users.set(toId(u), u.charAt(0));
            Users.get(u).update(this, u);
        });
    }

    userJoin(username) {
        let user = Users.get(toId(username));
        user.update(this, username);
        this.users.set(user.userid, username.charAt(0));
        if (this.userIsBlacklisted(user.userid)) this.send(null, "/roomban " + user.userid + ", Blacklisted user.");
    }

    userLeave(username) {
        this.users.delete(toId(username));
        if (Users.users.has(toId(username))) Users.get(toId(username)).onLeave(this);
    }

    userRename(oldId, newName) {
        if (this.userData[oldId] && toId(newName) !== oldId) {
            this.userData[toId(newName)] = this.userData[oldId];
            delete this.userData[oldId];
        }
        this.userLeave(oldId);
        Users.rename(oldId, newName);
        this.userJoin(newName);
        if (this.game) {
            this.game.onRename(oldId, newName);
        }
    }

    send(userid, message, priority) {
        if (!userid) userid = Config.bot.name;
        send((this.id === "lobby" ? "" : this.id) + "|" + message, userid, priority);
    }

    moderate(user, msg) {
        let botsRank = Users.get(toId(Monitor.username)).getRank(this.id);
        let userRank = user.getRank(this.id);
        if (user.userid === toId(Monitor.username) || Config.ranks[botsRank] < 2 || Config.ranks[botsRank] <= Config.ranks[userRank]) return false;
        msg = msg.trim().replace(/[ \u0000\u200B-\u200F]+/g, ' '); // removes extra spaces and null characters so messages that should trigger stretching do so
        if (msg.startsWith('/raw') || msg.startsWith('/html')) {
            return; // dont moderate lines with emotes for now.
        }

        if (!this.userData[user.userid]) {
            this.userData[user.userid] = {
                "demerits": 0,
                times: [],
                posts: [],
                recentMod: false,
                last: 0
            };
        }
        //process and save chat data/times
        let userData = this.userData[user.userid];
        let now = Date.now();
        if (now - userData.last > 8500) {
            userData.posts = [];
        }
        userData.last = now;
        userData.times.push(now);
        userData.posts.push(msg);
        //save last 5 posts/times
        if (userData.posts.length > 7) {
            userData.posts.shift();
        }
        if (userData.times.length > 7) {
            userData.times.shift();
        }

        let minModRank;

        function getModCommand(value) {
            value = value - 1;
            let choices = ["warn", "warn", "mute", "mute", "mute", "mute", "hourmute", "hourmute", "hourmute", "roomban"];
            if (value > 9) value = 9;
            let modCommand = choices[value];
            if (botsRank === "%" && modCommand === "roomban") return "hourmute";
            return modCommand;
        }

        function shouldModerate(uRank, mRank) {
            if (mRank === "on") return true;
            if (mRank === "off") return false;
            if (Config.ranks[uRank] > Config.ranks[mRank]) return false;
            return true;
        }
        let applyModeration = {
            points: 0,
            reasons: []
        };
        let moderateAll = false;
        Object.keys(Config.modSettings).forEach(aspect => {
            minModRank = Db("settings").get([this.id, "moderation", aspect], "+");
            if (shouldModerate(userRank, minModRank) || moderateAll) {
                switch (aspect) {
                    case "caps":
                        let capsMatch = msg.replace(/[^A-Z]/g, "");
                        if (capsMatch && capsMatch.length >= 15 && ((capsMatch.length >= ~~(toId(msg).length * 0.8)) || capsMatch.length >= 65)) {
                            if (capsMatch.length >= 70) {
                                applyModeration.points += 3;
                            }
                            applyModeration.points++;
                            applyModeration.reasons.push("caps");
                            moderateAll = true;
                        }
                        break;
                    case "stretching":
                        let stretchMatch = /(.)\1{7,}/gi.test(msg) || /(..+)\1{4,}/gi.test(msg); // matches the same character (or group of characters) 8 (or 5) or more times in a row
                        if (stretchMatch) {
                            applyModeration.points++;
                            applyModeration.reasons.push("stretching");
                        }
                        break;
                    case "face":
                        if (/\༼[^0-9a-zA-Z]{4,}\༽/g.test(msg) || /\([^0-9a-zA-Z]{6,}\)/g.test(msg)) {
                            applyModeration.points += 1.5;
                            applyModeration.reasons.push("face");
                        }
                        break;
                    case "flooding":
                        let times = userData.times;
                        //different intervals to gauge flooding
                        if ((times.length >= 4 && now - times[times.length - 4] <= 3100) || (times.length >= 5 && now - times[times.length - 5] <= 4400) || (times.length >= 7 && now - times[times.length - 7] <= 7700)) {
                            applyModeration.points += 3.5;
                            applyModeration.reasons.push("flooding");
                        }
                        break;
                    case "spam":
                        function arrayCount(array, search) {
                            let tarTimes = 0;
                            for (let arrayIndex = 0; arrayIndex < array.length; arrayIndex++) {
                                if (array[arrayIndex] === search || Tools.matchText(array[arrayIndex], search) > 80 || (array[arrayIndex].indexOf(search) > -1 && search.length > 15) || (search.indexOf(array[arrayIndex]) > -1 && array[arrayIndex].length > 15))
                                    tarTimes++;
                            }
                            return tarTimes;
                        }

                        function spamLetterCount(string) {
                            let foundLetters = [];
                            for (let lindex = 0; lindex < string.length; lindex++) {
                                let tarLetter = string[lindex];
                                if (foundLetters.indexOf(tarLetter) > -1) continue;
                                if ("sdfghjk".indexOf(tarLetter) > -1) {
                                    foundLetters.push(tarLetter);
                                }
                            }
                            return foundLetters.length >= 2;
                        }

                        function parseRandomLetterSpam(array) {
                            let tarTimes = 0;
                            for (let arrayIndex = 0; arrayIndex < array.length; arrayIndex++) {
                                let spaceCount = array[arrayIndex].length - array[arrayIndex].replace(/\s/g, "").length;
                                let spamLetter = spamLetterCount(array[arrayIndex]);
                                //test if it doesnt have the non middle row vowels, has enough of the commonly found spam letters, less than 2 spaces; or is shorter than 3 characters and IS NOT "lol".... shouldn't be spamming lol anyways
                                if ((!/[eiou]/i.test(array[arrayIndex]) && spaceCount <= 1 && spamLetter) || (toId(array[arrayIndex]).length <= 3 && array[arrayIndex].length <= 3 && array[arrayIndex] !== "lol")) tarTimes++;
                            }
                            return tarTimes;
                        }
                        if (arrayCount(userData.posts, msg) >= 4 || parseRandomLetterSpam(userData.posts) >= 5) {
                            applyModeration.points += 3.5;
                            applyModeration.reasons.push("spam detected");
                            userData.posts = [];
                        }
                        break;
                    case "bannedwords":
                        let bannedWords = Db("settings").get([this.id, "bannedWords"], {});
                        if (Object.keys(bannedWords).length) {
                            let tMsg = msg.toLowerCase();
                            let maxPoints = 0;
                            let wordSearch;
                            for (let tWord in bannedWords) {
                                try {
                                    wordSearch = new RegExp(tWord, 'i');
                                }
                                catch (e) {
                                    continue;
                                }
                                if (wordSearch.test(tMsg)) {
                                    let bwPoints = bannedWords[tWord];
                                    maxPoints = maxPoints > bwPoints ? maxPoints : bwPoints;
                                }
                            }
                            if (maxPoints > 0) {
                                applyModeration.points += maxPoints;
                                applyModeration.reasons.push("banned phrase");
                            }
                        }
                        break;
                }
            }
        });
        if (applyModeration.points) {
            if (moderateAll && applyModeration.reasons.length >= 2) {
                //deal with purposeful rulebreakers more harshly, turning warn into 7 minutes
                applyModeration.points++;
            }
            //catch people who have malicious intention and do it immediately after
            if (userData.recentMod) {
                applyModeration.points = applyModeration.points * 2;
                applyModeration.reasons.push("+");
            }
            else {
                userData.recentMod = true;
                setTimeout(() => {
                    userData.recentMod = false;
                }, 45000);
            }
            userData.demerits += applyModeration.points;
            let modResponse = "/" + getModCommand(~~userData.demerits) + " " + user.userid + ", Automated moderation: " + applyModeration.reasons.join(", ");
            return this.send(null, modResponse, true);
        }
    }
}

let addRoom = Rooms.add = function(room) {
    let roomid = toId(room, true);
    if (rooms.has(roomid)) return getRoom(room);
    rooms.set(roomid, new Room(room));
};

let getRoom = Rooms.get = function(room) {
    let roomid = toId(room, true);
    if (!rooms.has(roomid)) addRoom(room);
    return rooms.get(roomid);
};

let autojoinRoom = Rooms.autojoin = function(room) {
    let roomid = toId(room, true);
    if (roomid !== "global") Db("autojoin").set(roomid, 1);
}

let deleteRoom = Rooms.delete = function(room, keepAutojoin) {
    let roomid = toId(room, true);
    getRoom(roomid).end();
    rooms.delete(roomid);
    //console.log(roomid + ": " + rooms.has(roomid))
    if (!keepAutojoin) {
        Db("autojoin").delete(roomid)
        Db.save();
    }
};

Rooms.botGame = require("./botgame.js").game;
Rooms.botGamePlayer = require("./botgame.js").player;

module.exports = Rooms;
