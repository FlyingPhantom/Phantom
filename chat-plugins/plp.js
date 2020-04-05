"use strict";

exports.game = "piplups letter placement";
exports.aliases = ["plp"];

class plpGame extends Rooms.botGame {
    constructor (room, scorecap) {
        super(room);
        
        this.targetPokemon = null;
        this.plp = null;
        this.allowJoins = false;
        this.gameId = "plp";
        this.gameName = "Piplup's Letter Placement";
        this.roundNumber = 0;
        this.scorecap = Math.abs(parseInt(scorecap) || 5);
        this.init();
    }
    
    init () {
        this.state = "started";
        if (this.scorecap <= 0) this.scorecap = 5;
        this.sendRoom("A new game of Piplup's Letter Placement is starting. Use ``" + this.room.commandCharacter[0] + "g`` to guess the Pokémon. First to " + this.scorecap + " points wins.");
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
            Leaderboard.onWin("plp", this.room, user.userid, this.scorecap).write();
            this.destroy();
            return;
        }
        this.sendRoom(user.name + " got the correct answer - ``" + this.targetPokemon + "`` - and has " + this.users[user.userid].points + " points.");
        this.initRound();
    }
    
    initRound () {
        this.roundNumber++;
        this.determineQuestion();
        this.sendRoom("Round " + this.roundNumber + " | " + this.plp + "");
    }
    
    determineQuestion () {
        this.targetPokemon = Tools.shuffle(Object.keys(Tools.Words))[0];
        let comb = [];
        for (let i = 0; i < this.targetPokemon.length; i++) {
         if (this.targetPokemon.length - i < 3) break;
         let combine = this.targetPokemon[i] + this.targetPokemon[i + 1] + this.targetPokemon[i + 2];
         comb.push(combine);
        }
        let smth = comb[Math.floor(Math.random() * comb.length)];
        let rand = ('This ' + Tools.Words[this.targetPokemon] + ' contains the letters **' + smth.replace(' ','').replace('-','').toUpperCase() + '**');
        this.plp = rand;
    }
    
    getScoreBoard () {
        let self = this;
        return "/wall Points: __" + Object.keys(this.users).sort().map((u) => {
            return '__' + self.users[u].name + "__ (" + self.users[u].points + ")";
        }).join(", ");
    }
}

exports.commands = {
    plp: function (target, room, user) {
        if (!room || !this.can("games")) return false;
        if(room.game) return this.send("There is already a game going on in this room! (" + room.game.gameName + ")");
        room.game = new plpGame(room, target);
    },
    plpscore: function (target, room, user) {
        if (!room || !this.can("games") || !room.game || room.game.gameId !== "plp") return false;
        this.send(room.game.getScoreBoard());
    },
    plpskip: function (target, room, user) {
       if (!room || !this.can("games") || !room.game || room.game.gameId !== "plp") return false;
        this.send("The correct answer was: " + room.game.targetPokemon);
        room.game.initRound();        
    },
    plprepost: function (target, room, user) {
        if (!room || !this.can("games") || !room.game || room.game.gameId !== "plp") return false;
        this.send("/wall ``Repost`` - Round " + room.game.roundNumber + " | " + room.game.plp + ".");
    },
};
