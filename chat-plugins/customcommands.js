'use strict';
exports.commands = {
    addcom: function(target, room, user) {
        if (!this.can("addcom")) return false;
        if (!target) return this.parse("/help addcom");
        let targetRoom = room ? room.id : "global";
        let parts = target.split(",");
        if (parts.length < 3 || !toId(parts[0])) return this.parse("/help addcom");
        parts[1] = parts[1] === " " ? " " : parts[1].trim();
        let commandInformation = {
            rank: parts[1] in Config.ranks ? parts[1] : Config.defaultRank,
            text: [parts.slice(2).join(",").trim()],
        }
        let existing = Db("customcommands").get([targetRoom, toId(parts[0])], null);
        if (Commands[toId(parts[0])]) return this.send("You cannot set a custom command with the same name as a bot command.")
        if (existing) return this.send("This command already exists as a custom command in this room!");
        Db("customcommands").set([targetRoom, toId(parts[0])], commandInformation);
        this.send("**" + toId(parts[0]) + "** has been added as a custom command to this room.");
    },
    delcom: function(target, room, user) {
        if (!this.can("addcom")) return false
        if (!target) return this.parse("/help delcom");
        target = toId(target);
        let targetRoom = room ? room.id : "global";
        let existing = Db("customcommands").get([targetRoom, target], null);
        if (!existing) return this.send("This room does not have that custom command.");
        Db("customcommands").delete([targetRoom, target]);
        Db.save();
        this.send("The custom command \"" + target + "\" has been removed from this room.");
    },
    appendcom: function(target, room, user) {
        if (!this.can("addcom")) return false
        if (!target) return this.parse("/help apppendcom");
        let parts = target.split(",");
        if(parts.length < 2) return this.parse("/help appendcom");
        let command = toId(parts[0]);
        let output = parts.slice(1).join(",");
        if(output.length > 250) return this.send("The additional output has to be under 250 characters long")
        let targetRoom = room ? room.id : "global";
        let existing = Db("customcommands").get([targetRoom, command], null);
        if (!existing) return this.send("This room does not have that custom command.");
        if(existing.text.length >= 3 && !user.hasBotRank("@")) return this.say("The command is too long for more to be added to it.");
        existing.text.push(output);
        Db("customcommands").set([targetRoom, command], existing);
        this.send("An additional line has been added to the custom command \"" + command + "\".");
    },
    comlist: function(target, room, user) {
        if (!this.can("addcom")) return false;
        let targetRoom = room ? room.id : "global";
        if (target && !room) {
            targetRoom = toId(target);
        }
        if (!Db("customcommands").get(targetRoom, null)) return this.send("No custom commands have been set yet.");
        let CC = Db("customcommands").get(targetRoom, {});
        let hastebin = "Custom Commmands for room: " + targetRoom + "\n\n" +
            Object.keys(CC).sort().map(c => (room ? room.commandCharacter[0] : Config.defaultCharacter[0]) + c + "\nRank: " + CC[c].rank + "\nOutput: " + CC[c].text.join("\n")).join("\n\n");
        Tools.uploadToHastebin(hastebin, link => {
            this.send("Custom commands for room " + targetRoom + ": " + link);
        });
    },
    alias: function (target, room, user) {
        if (!target || target.indexOf(",") === -1) return false;
        this.parse("/addcom " + target.replace(/, ?[^a-z0-9]?/i, ", ,{parse}/"));
    },
};
