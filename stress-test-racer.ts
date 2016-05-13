"use strict";

import {MongoClient, Db, Collection} from "mongodb";

import {IndependentRacer} from "./schema";
import {genId, randString, shuffle} from './util';

let teams:number = 20;
let racersATeam:number = 20;
let updateQueryRatio:number = 1;
let totalThreads:number = -1;
let thisThreadNum:number = 0;
let accessCount:number = 20;

let dbP:Promise<Db> = MongoClient.connect("mongodb://localhost:27017/racer");

class Update {
    constructor(public method:'add'|'remove', public racer:IndependentRacer, public id:string) {
    }
}

let updates:Array<Update> = new Array<Update>();
let queries:Array<string> = new Array<string>();
let both:Array<Update|string> = new Array<Update|string>();

process.on('message', (msg:any) => {
    if (typeof msg === "object" && msg.type === 'generate') {
        teams = msg.teams ? msg.teams : teams;
        racersATeam = msg.racersATeam ? msg.racersATeam : racersATeam;
        updateQueryRatio = msg.updateQueryRatio ? msg.updateQueryRatio : updateQueryRatio;
        thisThreadNum = msg.thisThreadNum ? msg.thisThreadNum : thisThreadNum;
        totalThreads = msg.totalThreads ? msg.totalThreads : totalThreads;
        accessCount = msg.accessCount ? msg.accessCount : accessCount;
        console.log(`Thread ${thisThreadNum}: Start Generation`);

        // Generate all the updates/queries here so the generation time is not recorded

        let totalRacers = racersATeam * teams;
        let idsPerThread = Math.floor(totalRacers / totalThreads);
        let availableIds:Array<string> = new Array<string>();
        for (let i = thisThreadNum; i < totalRacers; i += totalThreads) {
            availableIds.push(genId(i));
        }
        shuffle(availableIds);
        console.log(`Thread ${thisThreadNum}: Create update queue`);
        for (let i = 0; i < accessCount; ++i) {
            if (Math.random() < 0.5 && availableIds.length) {
                updates.push(new Update("remove", null, availableIds.pop()));
            } else {
                let newRacer:IndependentRacer = new IndependentRacer(
                    genId(Math.floor(Math.random() * teams)), randString(7), randString(7), Math.random() * 10 + 7,
                    Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10,
                    randString(30), Math.random() > 0.5, `${thisThreadNum}-${genId(Math.random() * accessCount + totalRacers)}`);
                availableIds.push(newRacer.id);
                updates.push(new Update("add", newRacer, null));
            }
        }
        console.log(`Thread ${thisThreadNum}: Create query queue`);
        for (let i = 0; i < accessCount; ++i) {
            queries.push(availableIds[Math.floor(availableIds.length * Math.random())]);
        }
        console.log(`Thread ${thisThreadNum}: Create hybrid queue`);
        for (let i = 0; i < accessCount; ++i) {
            if (Math.random() < updateQueryRatio / (updateQueryRatio + 1)) {
                if (Math.random() < 0.5 && availableIds.length) {
                    both.push(new Update("remove", null, availableIds.pop()));
                } else {
                    let newRacer:IndependentRacer = new IndependentRacer(
                        genId(Math.floor(Math.random() * teams)), randString(7), randString(7), Math.random() * 10 + 7,
                        Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10,
                        randString(30), Math.random() > 0.5, `${thisThreadNum}-${genId(Math.random() * accessCount + totalRacers)}`);
                    availableIds.push(newRacer.id);
                    both.push(new Update("add", newRacer, null));
                }
            } else {
                both.push(availableIds[Math.floor(availableIds.length * Math.random())]);
            }
        }

        console.log(`Thread ${thisThreadNum}: Generation Complete`);
        // Send ready signal once database is connected and updates and queries are generated
        dbP.then(()=>process.send('ready'));
    } else if (msg === 'update') {
        dbP.then(db => {
            let col:Collection = db.collection('ski');

            Promise.all(updates.map(update => {
                if (update.method === 'add') {
                    return col.insertOne(update.racer);
                } else {
                    return col.deleteOne({id: update.id});
                }
            })).then(() => process.send('update'));
        });
    } else if (msg === 'query') {
        dbP.then(db => {
            let col:Collection = db.collection('ski');
            Promise.all(queries.map(query=>col.find({id: query}))).then(() => process.send('query'));
        });
    } else if (msg === 'both') {
        dbP.then(db => {
            let col:Collection = db.collection('ski');
            Promise.all(both.map(obj => {
                if (typeof obj === "string") {
                    return col.find({id: obj});
                } else {
                    if (obj.method === 'add') {
                        return col.insertOne(obj.racer);
                    } else {
                        return col.deleteOne({id: obj.id});
                    }
                }
            })).then(() => process.send('both'));
        });
    }
});

process.on('disconnect', () => {
    dbP.then((db)=> {
        db.close()
    });
});