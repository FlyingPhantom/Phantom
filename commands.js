'use strict';
// use return false to show that the command didnt go through to prevent triggering false monitor moderations

exports.commands = {
    say: function(target, room, user) {
        if (!this.can("say")) return false;
        return this.send(removeCommand(target));
    },
    //settings
    addchar: function(target, room, user) {
        if (!this.can("set") || !room) return false;
        if (target.length !== 1 || toId(target) || target === " ") return this.send("The command character has to be 1 character long, and cannot be an alphanumeric character.");
        if(room.commandCharacter.includes(target)) return this.send("This is already a command character in this room.")
        room.addCommandCharacter(target);
        this.send(target + " has been added to this room's command characters.");
    },
    setchar: function(target, room, user) {
        if (!this.can("set") || !room) return false;
        if (target.length !== 1 || toId(target) || target === " ") return this.send("The command character has to be 1 character long, and cannot be an alphanumeric character.");
        room.commandCharacter = [];
        room.addCommandCharacter(target);
        this.send(target + " is set as this room's command character.");
    },
    deletechar: function(target, room, user) {
        if (!this.can("set") || !room) return false;
        if (target.length !== 1 || toId(target) || target === " ") return this.send("The command character has to be 1 character long, and cannot be an alphanumeric character.");
        if (room.commandCharacter.length === 1) return this.send("You need at least one command character in every room!");
        if (!room.commandCharacter.includes(target)) return this.send("That is not one of the room's command characters!");
        room.removeCommandCharacter(target);
        this.send(target + " has been removed from this room's command characters.");
    },
    setprivate: function(target, room, user) {
        if (!this.can("set") || !room) return false;
        switch (toId(target)) {
            case "on":
                Db("settings").set([room.id, "isPrivate"], true);
                room.isPrivate = true;
                break;
            case "off":
                Db("settings").set([room.id, "isPrivate"], false);
                room.isPrivate = false;
                break;
            default:
                return this.send("This room is currently marked as " + (Db("settings").get([room.id, "isPrivate"], false) ? "private." : "public."));
        }
        return this.send("This room is currently marked as " + (Db("settings").get([room.id, "isPrivate"], false) ? "private." : "public."));
    },
    set: function(target, room, user) {
        if (!this.can("set") && !this.can("addcom")) return false;
        if (!target) return this.parse("/help set");
        let parts = target.replace(/\, /g, ",").split(",");
        if (parts[0] === "mod") {
            if (!this.can("set") || !room) return false; // roomowner only
            if (!parts[1] || !parts[2]) return this.parse("/help set mod");
            parts[2] = parts[2].trim().replace(/^reg$/i, " ");
            if (!Config.modSettings[toId(parts[1])] || (!["on", "off"].includes(parts[2].toLowerCase()) && !(parts[2] in Config.ranks))) return this.parse("/help set mod");
            let modAspect = toId(parts[1]);
            let modSetting = parts[2].toLowerCase();
            Db("settings").set([room.id, "moderation", modAspect], modSetting);
            return this.send("Moderation for " + modAspect + " will be applied to users of rank \"" + modSetting + "\" and below.");
        }
        let targetCommand = toId(parts[0]);
        let mainCommand;
        if(Commands[targetCommand] && !Config.settableCommands[targetCommand] && typeof Commands[targetCommand] === "string"){
            mainCommand = Commands[targetCommand];
        }
        if (Config.settableCommands[mainCommand || targetCommand]) {
            if (!this.can("set") || !room) return false; // roomowner only
            if(mainCommand) targetCommand = mainCommand;
            if (!parts[1]) return this.parse("/help set");
            let targetSetting = parts[1].toLowerCase();
            if (!Config.ranks[targetSetting] && !["on", "off"].includes(targetSetting)) return this.parse("/help set");
            Db("settings").set([room.id, targetCommand], targetSetting);
            return this.send(room.commandCharacter[0] + targetCommand + " is now " + (toId(targetSetting) ? targetSetting.toUpperCase() : "usable by users " + targetSetting + " and above") + ".");
        }
        let roomCCon = Db("customcommands").get([room ? room.id : "global", targetCommand], null);
        if (roomCCon) {
            let customComSetting = parts[1].toLowerCase();
            if (!Config.ranks[customComSetting]) return this.parse("/help set");
            roomCCon.rank = customComSetting;
            Db("customcommands").set([room ? room.id : "global", targetCommand], roomCCon);
            return this.send("Custom command " + (room ? room.commandCharacter[0] : Config.defaultCharacter[0]) + targetCommand + " is now usable by users " + customComSetting + " and above.");
        }
        this.send(room.commandCharacter[0] + targetCommand + " is neither a custom command nor a regular command on the bot that can be set.")
    },
    bw: "banword",
    regexbanword: "banword",
    banword: function(target, room, user, cmd) {
        if (cmd === "regexbanword" ? (!this.can("set") && user.hasBotRank("+")) : !this.can("banword") || !room) return false;
        if (!target) return this.parse("/help " + (cmd === "bw" ? "banword" : cmd));
        target = target.split(",");
        let points = 3;
        let regexBanword = target.slice(0, target.length - 1).join(",");
        if (isNaN(parseInt(target[target.length - 1]))) {
            regexBanword = target.join(",");
        }
        else if (parseInt(target[target.length - 1]) >= 1) {
            points = parseInt(target[target.length - 1]);
        }
        if (cmd !== "regexbanword") {
            regexBanword = Tools.regexify(regexBanword.trim());
        } else {
            // test for evil regex
            if (/(?!\\)\(.*?(?:[^\\])[\*\+\?][^\)]*?(?!\\)\)([\*\+]|\{[0-9]+(\,|\,?[0-9]*?)\})/i.test(regexBanword)) return this.send("Sorry, I cannot accept that as a regexbanword as your banned phrase may contain some [[evil regex]]...");
            // test if it's actually working regex
            try {
                let test = new RegExp(regexBanword);
            } catch (e) {
                return this.errorReply(e.message.substr(0, 28) === 'Invalid regular expression: ' ? e.message : 'Invalid regular expression: /' + regexBanword + '/: ' + e.message);
            }
        }
        if (!regexBanword) return this.parse("/help " + (cmd === "bw" ? "banword" : cmd));
        let banwordExists = Db("settings").get([room.id, "bannedWords", regexBanword], null);
        if (banwordExists) return this.send("That already exists as a banned phrase in this room.");
        Db("settings").set([room.id, "bannedWords", regexBanword], points);
        this.send("The phrase /" + regexBanword + "/i is banned with a point value of " + points + ".");
    },
    unbanword: function(target, room, user) {
        if (!this.can("banword") || !room) return false;
        if (!target) return this.parse("/help unbanword");
        target = target.trim();
        let banwordExists = Db("settings").get([room.id, "bannedWords", target], null);
        if (!banwordExists) {
            target = Tools.regexify(target);
            banwordExists = Db("settings").get([room.id, "bannedWords", target], null);
            if (!banwordExists) {
                return this.send("That's not a banned word in this room!");
            }
        }
        Db("settings").delete([room.id, 'bannedWords', target]);
        Db.save();
        this.send("//" + target + "/i has been removed from this room's list of banned words");
    },
    ab: "autoban",
    autoban: function(target, room, user, cmd) {
        if (!this.can("autoban") || !room) return false;
        if (!target) return this.parse("/help autoban");
        target = toId(target);
        if (target.length > 18 || target.length < 1) return this.send("This is not a legal PS username.")
        if (room.userIsBlacklisted(target)) return this.send("This user is already blacklisted.");
        room.blacklistUser(target);
        this.send("/roomban " + target + ", Blacklisted user.");
        this.send("/modnote \"" + target + "\" was added to the blacklist by " + user.name + ".");
        this.send(target + " was successfully added to the blacklist.");
    },
    unab: "unautoban",
    unautoban: function(target, room, user) {
        if (!this.can("autoban") || !room) return false;
        if (!target) return this.parse("/help unautoban");
        target = toId(target);
        if (target.length > 18 || target.length < 1) return this.send("That is not a legal PS username.")
        if (!room.userIsBlacklisted(target)) return this.send("This user is not blacklisted.");
        room.unblacklistUser(target);
        this.send("/roomunban " + target);
        this.send("/modnote \"" + target + "\" was removed from the blacklist by " + user.name + ".");
        this.send(target + " was successfully removed from the blacklist.");
    },
    settings: function(target, room, user) {
        if (!room && !target) return user.sendTo("Please specify the room.");
        let targetRoom = room;
        if (target) {
            if (Rooms.rooms.has(toId(target, true))) {
                targetRoom = Rooms.get(target);
            }
            else {
                if (!room || this.can("settings")) {
                    return user.sendTo("The bot is not in the room you specified.");
                }
                return false;
            }
        }
        if (!user.can("settings", targetRoom)) {
            //not leaking private rooms
            if (targetRoom.isPrivate) return user.sendTo("The bot is not in the room you specified.");
            return false;
        }
        //get list of banned words
        let roomSettings = Db("settings").get(targetRoom.id);
        let nonCommandValues = ["rch", "moderation", "isPrivate", "bannedWords", "roomBlacklist"];

        function buildBannedWords() {
            let buffer = "+----------------------------------+\n" +
                "| BannedWords                      |\n" +
                "+----------------------------------+\n";
            if (roomSettings.bannedWords && Object.keys(roomSettings.bannedWords).length) {
                buffer += Object.keys(roomSettings.bannedWords).map(w => "| (" + roomSettings.bannedWords[w] + ") " + w + "                              ".slice(w.length + roomSettings.bannedWords[w].toString().length) + "|").join("\n") + "\n";
            }
            else {
                buffer += "| None!                            |\n";
            }
            buffer += "+----------------------------------+\n\n";
            return buffer;
        }

        function buildBlacklist() {
            let buffer = "+----------------------+\n" +
                "| Blacklisted Users    |\n" +
                "+----------------------+\n";
            if (targetRoom.blacklist && Object.keys(targetRoom.blacklist).length) {
                buffer += Object.keys(targetRoom.blacklist).sort().map(w => "| - " + w + "                   ".slice(w.length) + "|").join("\n") + "\n";
            }
            else if (!targetRoom.blacklist || Object.keys(targetRoom.blacklist).length === 0) {
                buffer += "| None!                |\n";
            }
            buffer += "+----------------------+\n\n";
            return buffer;
        }

        function getModerationSettings() {
            let modBuffer = "Moderation Settings: \n" +
                "+-------------------+-----+\n" +
                "| Moderation Aspect |     |\n" +
                "+-------------------+-----+\n";

            modBuffer += Object.keys(Config.modSettings).map(aspect => {
                let tSetting = roomSettings.moderation && roomSettings.moderation[aspect] ? roomSettings.moderation[aspect].toUpperCase() : "+";
                return "| " + aspect + "                  ".slice(aspect.length) + "| " + tSetting + "    ".slice(tSetting.length) + "|\n";
            }).join("+ - - - - - - - - - + - - +\n");
            modBuffer += "+-------------------+-----+\n";
            modBuffer += "*NOTE: the bot will moderate users of that rank and lower for each aspect.\n\n";
            return modBuffer;
        }

        function getCommandSettings() {
            let comBuffer = "Command Settings: \n" +
                "+------------------+-----+\n" +
                "| Command          |     |\n" +
                "+------------------+-----+\n";
            let collectCommands = [];
            for (let aspect in roomSettings) {
                if (nonCommandValues.includes(aspect)) continue;
                let tSetting = roomSettings && roomSettings[aspect] ? roomSettings[aspect].toUpperCase() : Config.defaultRank;
                collectCommands.push("|" + aspect + "                  ".slice(aspect.length) + "| " + tSetting + "    ".slice(tSetting.length) + "|\n");
            }
            comBuffer += collectCommands.join("+ - - - - - - - - -+ - - +\n") +
                "+------------------+-----+\n" +
                "*NOTE: Most commands that have not been set require rank " + Config.defaultRank + " to use/broadcast.\n\n";
            return comBuffer;
        }
        let settingsDisplay = "" +
            "Room name: " + targetRoom.name + "\n" +
            "Room ID: " + targetRoom.id + "\n" +
            "Private Room: " + targetRoom.isPrivate + "\n" +
            "Command characters for this room: " + targetRoom.commandCharacter.join(", ") + "\n\n";
        if (roomSettings) {
            settingsDisplay += getModerationSettings() +
                buildBannedWords() +
                buildBlacklist() +
                getCommandSettings();
        }
        Tools.uploadToHastebin("Settings: \n=========\n\n" + settingsDisplay, link => {
            user.sendTo("Settings for " + targetRoom.name + ": " + link);
        });
    },

};
