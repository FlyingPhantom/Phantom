"use strict";

const LOG_FILE = "config/hunt-logs.txt";
function logLine (ln) {
    fs.appendFile(LOG_FILE, "[" + getEST() + "] " + ln + "\n");
}

exports.commands = {
    addhunt: function (target, room, user) {
        if (!Rooms.rooms.has("scavengers") || !user.hasRank(Rooms.get("scavengers"), "+")) return this.send("The bot must be in the scavengers room for this to work. You must also have at least + in the scavengers room.");
        
        let [id, link] = target.split(", ");
        id = toId(id, true);
        link = link.trim();
        
        if (Db("hunts").has(id)) return this.send("That ID is already taken.");
        
        Db("hunts").set(id, {
            link: link,
            addedBy: user.userid,
            date: Date.now(),
            qc: [],
            views: [user.userid],
        });
        
        logLine(`${user.userid} has added a new hunt. [${link}]`);
        this.send("Added.");
    },
    
    deletehunt: "removehunt",
    removehunt: function (target, room, user) {
        if (!Rooms.rooms.has("scavengers")) return this.send("The bot must be in the scavengers room for this to work.")
        let scav = Rooms.get("scavengers");
        if (!user.hasRank(scav, "+")) return this.send("You must be in the scavengers room, and have at least + in the scavengers room.");
        let id = toId(target, true);
        
        let targetHunt = Db("hunts").get(id, null);
        
        if (!targetHunt) return this.send("Invalid hunt.");
        
        if (!user.hasRank(scav, "%") && targetHunt.addedBy !== user.userid) return this.send("You are not permitted to remove this hunt.");
        
        Db("hunts").delete(id);
        
        logLine(`${user.userid} has deleted a hunt. [${id}]`);
        this.send("Deleted.");
    },
    
    viewhunt: function (target, room, user) {
        if (!Rooms.rooms.has("scavengers")) return this.send("The bot must be in the scavengers room for this to work.")
        let scav = Rooms.get("scavengers");
        if (!user.hasRank(scav, "+")) return this.send("You must be in the scavengers room, and have at least + in the scavengers room.");
        let id = toId(target, true);
        
        let targetHunt = Db("hunts").get(id, null);
        
        if (!targetHunt) return this.send("Invalid hunt.");
        
        if (!user.hasRank(scav, "%") && targetHunt.addedBy !== user.userid) return this.send("You are not permitted to remove this hunt.");
        
        if (!targetHunt.views.includes(user.userid)) {
            targetHunt.views.push(user.userid);
            Db("hunts").get(id, targetHunt);
        }
        
        logLine(`${user.userid} has viewed hunt ${id}`);
        user.sendTo(`**By**: ${targetHunt.addedBy}. **Date**: ${getEST(targetHunt.date)}. **Link**: ${targetHunt.link}. **Views** (${targetHunt.views.length}): ${targetHunt.views.join(", ")}. ${targetHunt.qc.length ? `**QCs** (${targetHunt.qc.length}): ${targetHunt.qc.join(", ")}` : ''}`);
    },
    
    qchunt: function (target, room, user) {
        if (!Rooms.rooms.has("scavengers")) return this.send("The bot must be in the scavengers room for this to work.")
        let scav = Rooms.get("scavengers");
        if (!user.hasRank(scav, "%")) return this.send("You must be in the scavengers room, and have at least % in the scavengers room.");
        let id = toId(target, true);
        
        let targetHunt = Db("hunts").get(id, null);
        
        if (!targetHunt) return this.send("Invalid hunt.");
        
        if (!targetHunt.views.includes(user.userid)) return this.send("You cannot QC a hunt you have not seen yet.");
        if (targetHunt.qc.includes(user.userid)) return this.send("You have already QC'd this hunt");
        if (targetHunt.addedBy === user.userid) return this.send("You cannot QC your own hunts.");
        
        targetHunt.qc.push(user.userid);
        
        Db("hunts").set(id, targetHunt);
        
        logLine(`${user.userid} has QC'd hunt ${id}`);

        this.send("QC'd.");
    },
    
    userhunts: function (target, room, user) {
        if (!Rooms.rooms.has("scavengers")) return this.send("The bot must be in the scavengers room for this to work.")
        let scav = Rooms.get("scavengers");
        target = toId(target);
        if (!user.hasRank(scav, "%") && user.userid !== target) return this.send("The user must be in the scavengers, and have at least % in the scavengers room.");
        
        let data = Db("hunts").cache;
        
        let targetHunts = Object.keys(data).filter(id => data[id].addedBy === target);
        
        this.send(`${targetHunts.length} stored hunt${targetHunts.length === 1 ? "" : "s"} by ${target}: ${targetHunts.join(", ")}`);
    },
    
    pendinghunts: function (target, room, user) {
        if (!Rooms.rooms.has("scavengers")) return this.send("The bot must be in the scavengers room for this to work.")
        let scav = Rooms.get("scavengers");
        target = toId(target);
        if (!user.hasRank(scav, "%") && user.userid !== target) return this.send("The user must be in the scavengers, and have at least % in the scavengers room.");
        
        let data = Db("hunts").cache;
        
        let targetHunts = Object.keys(data).filter(id => data[id].qc.length < 2).map(key => (data[key].qc.includes(user.userid) ? "" : (data[key].addedBy === user.userid ? "__" : "**")) + key + " [QC " + data[key].qc.length + "/2]" + (data[key].qc.includes(user.userid) ? "" : (data[key].addedBy === user.userid ? "__" : "**")));
        
        this.send(`**Pending** (${targetHunts.length}): ${targetHunts.join(", ")}`);
    },
    
    readyhunts: function (target, room, user) {
        if (!Rooms.rooms.has("scavengers")) return this.send("The bot must be in the scavengers room for this to work.")
        let scav = Rooms.get("scavengers");
        target = toId(target);
        if (!user.hasRank(scav, "%") && user.userid !== target) return this.send("The user must be in the scavengers, and have at least % in the scavengers room.");
        
        let data = Db("hunts").cache;
        
        let targetHunts = Object.keys(data).filter(id => data[id].qc.length >= 2);
        
        this.send(`**Ready** (${targetHunts.length}): ${targetHunts.join(", ")}`);
    },
    
    scavhelp: function () {
        this.send("Hunt-Manager guide: https://pastebin.com/8CbAPjLd");
    },
    
    huntlogs: function (target, room, user) {
        if (!this.can("dev")) return false;
        
        let [search, lines] = target.split(",").map(p => p.trim());
        if (!lines) {
            if (parseInt(search)) {
                lines = "" + search;
                search = null;
            }
        }
        lines = parseInt(lines) || 15;
        
        // async readfile and search
        Promise.resolve(
            fs.readFile(LOG_FILE, (err, data) => {
                if (err) return this.send("ERROR: " + err);
            
                let entries = data.toString().split("\n");
                if (search) entries = entries.filter(s => s.includes(search));
                entries = entries.slice(-lines - 1).reverse();
            
                Tools.uploadToHastebin(`Last ${entries.length} lines of HuntLogs${search ? ` containing '${search}'`: ""}:\n\n` + entries.join("\n"), link => {
                    this.send(link);
                })
            })
        );
    },
};
