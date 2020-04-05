"use strict";

const NAMES = ["Simeon says: ", "Susan says: ", "Samson says: ", "Simone says: ", "Simba says: ", "", "", ""];
const ACTIONS = ["up", "down", "left", "right", "front", "back"];
const INVERSIONS = {
    "up": "down",
    "down": "up",
    "left": "right",
    "right": "left",
    "front": "back",
    "back": "front",
};

exports.game = "simonsays";
exports.aliases = ["simon", "sss"];

class SimonsaysGame extends Rooms.botGame {
    constructor (room) {
        super(room);
        
        this.state = "signups";
        this.allowJoins = "true";
        this.answerKey = null;
        this.postActions = null;
        this.shouldAnswer = null;
        this.gameName = "Simon Says";
        this.gameId = "simonsays";
        this.roundNumber = 0;
        
        this.sendRoom("A new game of Simon Says is starting. ``" + this.room.commandCharacter[0] + "join`` to join the game.");
    }
    
    onStart () {
        if (this.state !== "signups" || this.userList.length < 2) return false;
        this.state = "idling";
        this.sendRoom("Simply " + this.room.commandCharacter[0] + "g [move, move,...] to submit your move. Modifiers: Retrograde - ``back, front`` ==> ``front, back``; Double - ``left, back`` ==> ``left, back, left, back``; Inversion: ``up, left`` ==> ``down, right``");
        this.postPlayerList();
        let self = this;
        this.timer = setTimeout(() => {
            self.onInitRound();
        }, 12000);
    }
    
    onInitRound () {
        this.roundNumber++;
        this.createRoundAction();
        this.sendRoom(this.postActions);
        this.state = "answer";
        // time is decided upon the length of the row
        let timeAllotment = (2.5 * this.answerKey.length) * ((100 - this.roundNumber * 2) / 100) * 1000;
        if (timeAllotment < this.answerKey.length * 1000) timeAllotment = this.answerKey.length * 1000;
        // run timer
        let self = this;
        this.timer = setTimeout(() => {
            self.onTurnEnd();
        }, timeAllotment);
    }
    
    onGuess (user, answer) {
        if (this.state !== "answer" || !this.userList.includes(user.userid) || !answer || this.users[user.userid].answer) return false;
        this.users[user.userid].answer = answer.split(",");
    }
    
    onTurnEnd () {
        this.state = "idling";
        let eliminated = [];
        for (var id in this.users) {
            let player = this.users[id];
            if (!this.shouldAnswer) {
                // simon didn't say it
                if (player.answer) {
                    eliminated.push(player.name);
                    this.eliminate(player.userid);
                    continue;
                }
                player.answer = null;
            } else {
                // legal simon says round
                if (!player.answer) { 
                    eliminated.push(player.name);
                    this.eliminate(player.userid);
                    continue;
                }
                let legality = true;
                this.answerKey.forEach((k, i) => {
                    if (!player.answer[i] || toId(player.answer[i]) !== k) legality = false;
                });
                if (!legality) {
                    eliminated.push(player.name);
                    this.eliminate(player.userid);
                    
                }
                player.answer = null;
            }
        }
        if (eliminated.length) {
            this.sendRoom(eliminated.join(", ") + (eliminated.length > 1 ? " were" : " was") + " eliminated!");
        }
        // one player left
        if (this.userList.length === 1) {
            this.sendRoom("Congratulations! " + this.users[this.userList[0]].name + " has won the game!");
            this.destroy();
            return;
        }
        // no players left
        if (this.userList.length === 0) {
            this.sendRoom("Everyone has been eliminated! Better luck next time!");
            this.destroy();
            return;
        }
        // start next round
        this.postPlayerList();
        let self = this;
        this.timer = setTimeout(() => {
            self.onInitRound();
        }, 3000);
    }
    eliminate (userid) {
        //remove players
        delete this.users[userid];
        this.userList.splice(this.userList.indexOf(userid), 1);
    }
    
    createRoundAction () {
        // determine length of base row of actions
        let length = ~~(Math.random() * 4) + 4;
        // determine which modifiers will be used for the round.
        let modifier = {
            Inversion: Math.random() > 0.75,
            Double: Math.random() > 0.8,
            Retrograde: Math.random() > 0.75,
        };
        // determine whether it is a trick round
        this.shouldAnswer = Math.random() <= 0.7;
        
        // determine the base row.
        let baseRow = [];
        for (let i = 0; i < length; i++) {
            let action = ACTIONS[~~(Math.random() * 6)];
            baseRow.push(action);
        }
        // apply modifiers
        let applyModifications = [];
        Object.keys(modifier).forEach((m) => {
            if(modifier[m]) applyModifications.push(m);
        });
        
        // set question
        this.postActions = "Round " + this.roundNumber + " | " +
            // modifiers
            (applyModifications.length ? "[" + applyModifications.sort().join("|") + "] | " : "") +
            // set trick
            (!this.shouldAnswer ? NAMES[~~(Math.random() * 9)] : "Simon Says: ") +
            // post 
            "``" + baseRow.join(", ") + "`` ";

        // apply to answer key    
        this.answerKey = baseRow;
        
        // inversion
        if (applyModifications.includes("Inversion")) {
            this.answerKey = baseRow.map((a) => {
                return INVERSIONS[a];
            });
        }
        // retrograde
        if (applyModifications.includes("Retrograde")) {
            this.answerKey = this.answerKey.reverse();
        }
        // double
        if (applyModifications.includes("Double")) {
            this.answerKey = this.answerKey.concat(this.answerKey);
        }
        return this.answerKey;
    }
}

exports.commands = {
    simonsays: function (target, room, user) {
        if(!room || !this.can("games")) return false;
        if(room.game) return this.send("There is already a game going on in this room! (" + room.game.gameName + ")");
        room.game = new SimonsaysGame(room);
    },
}; 
