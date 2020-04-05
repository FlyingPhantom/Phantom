"use strict";

exports.game = "edges";
exports.aliases = ["edge"];

class EdgeGame extends Rooms.botGame {
    constructor (room, scorecap) {
        super(room);
        
        this.targetPokemon = null;
        this.anagram = null;
        this.allowJoins = false;
        this.gameId = "edges";
        this.gameName = "Edges";
        this.roundNumber = 0;
        this.scorecap = Math.abs(parseInt(scorecap) || 5);
        this.init();
    }
    
    init () {
        this.state = "started";
        if (this.scorecap <= 0) this.scorecap = 5;
        this.sendRoom("A new game of Edges is starting. Use ``" + this.room.commandCharacter[0] + "g`` to guess the Pokémon. First to " + this.scorecap + " points wins.");
        this.initRound();
    }
    
    onGuess (user, answer) {
        if (!answer || toId(answer) !== toId(this.targetPokemon)) return;
        if (!(user.userid in this.users)) {
            this.users[user.userid] = new Rooms.botGamePlayer(user);
            this.users[user.userid].points = 0;
            this.userList.push(user.userid);
        }
        this.users[user.userid].points++;
        if (this.users[user.userid].points >= this.scorecap) {
            this.sendRoom(user.name + " has won the game!");
            Leaderboard.onWin("edges", this.room, user.userid, this.scorecap).write();
            this.destroy();
            return;
        }
        this.sendRoom(user.name + " got the correct answer - ``" + this.targetPokemon + "`` - and has " + this.users[user.userid].points + " points.");
        this.initRound();
    }
    
    initRound () {
        this.roundNumber++;
        this.determineQuestion();
        this.sendRoom("Round " + this.roundNumber + " | " + this.edge + ".");
    }
    
    determineQuestion () {
        this.targetPokemon = Tools.shuffle(Object.keys(Tools.Words))[0];
        this.edge = this.targetPokemon.slice(0,1) + ' - ' + this.targetPokemon.slice(this.targetPokemon.length - 1, this.targetPokemon.length).toUpperCase() + ' [' + Tools.Words[this.targetPokemon] + ']';
    }
    
    getScoreBoard () {
        let self = this;
        return "/wall Points: __" + Object.keys(this.users).sort().map((u) => {
            return self.users[u].name + "__ (" + self.users[u].points + ")";
        }).join(", ");
    }
}

exports.commands = {
    edges: function (target, room, user) {
        if (!room || !this.can("games")) return false;
        if(room.game) return this.send("There is already a game going on in this room! (" + room.game.gameName + ")");
        room.game = new EdgeGame(room, target);
    },
    edgesscore: function (target, room, user) {
        if (!room || !this.can("games") || !room.game || room.game.gameId !== "edges") return false;
        this.send(room.game.getScoreBoard());
    },
    edgesskip: function (target, room, user) {
        if (!room || !this.can("games") || !room.game || room.game.gameId !== "edges") return false;
        this.send("The correct answer was: " + room.game.targetPokemon);
        room.game.initRound();        
    },
    edgesrepost: function (target, room, user) {
        if (!room || !this.can("games") || !room.game || room.game.gameId !== "edges") return false;
        this.send("/wall ``Repost`` - Round " + room.game.roundNumber + " | " + room.game.edge + ".");
    },
};
