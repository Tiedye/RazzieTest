"use strict";

import {MongoClient, Db, Collection} from "mongodb";

import {Racer, Team} from "./schema";
import {genId, randString, shuffle, generateRacer} from './util';

let teams:number = 20;
let racersATeam:number = 20;
let updateQueryRatio:number = 1;
let totalThreads:number = -1;
let thisThreadNum:number = 0;
let accessCount:number = 20;

let dbP:Promise<Db> = MongoClient.connect("mongodb://localhost:27017/team");

class Update {
    constructor(public method:'add'|'remove', public racer:Racer, public team:string, public id:string) {
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
                updates.push(new Update("remove", null, null, availableIds.pop()));
            } else {
                let newRacer:Racer = generateRacer(`${thisThreadNum}-${genId(Math.random() * accessCount + totalRacers)}`);
                availableIds.push(newRacer.id);
                updates.push(new Update("add", newRacer, genId(Math.floor(Math.random() * teams)), null));
            }
        }
        console.log(`Thread ${thisThreadNum}: Create query queue`);
        for (let i = 0; i < accessCount; ++i) {
            queries.push(availableIds[Math.floor(availableIds.length * Math.random())]);
        }
        console.log(`Thread ${thisThreadNum}: Create hybrid queue`);
        let u=0, q=0;
        for (let i = 0; i < accessCount; ++i) {
            if (Math.random() < updateQueryRatio / (updateQueryRatio + 1)) {
                ++u;
                if (Math.random() < 0.5 && availableIds.length) {
                    both.push(new Update("remove", null, null, availableIds.pop()));
                } else {
                    let newRacer:Racer = generateRacer(`${thisThreadNum}-${genId(Math.random() * accessCount + totalRacers)}`);
                    availableIds.push(newRacer.id);
                    both.push(new Update("add", newRacer, genId(Math.floor(Math.random() * teams)), null));
                }
            } else {
                ++q;
                both.push(availableIds[Math.floor(availableIds.length * Math.random())]);
            }
        }
        console.log(`Thread ${thisThreadNum}: Hybrid stats: Updates ${u}, Queries ${q}`);

        console.log(`Thread ${thisThreadNum}: Generation Complete`);
        // Send ready signal once database is connected and updates and queries are generated
        dbP.then(()=>process.send('ready'));
    } else if (msg === 'update') {
        dbP.then(db => {
            let col:Collection = db.collection('ski');

            Promise.all(updates.map(update => {
                if (update.method === 'add') {
                    return col.findOneAndUpdate({"id":update.team}, {"$push":{"racers":update.racer}});
                } else {
                    return col.findOneAndUpdate({"racer.id":update.id}, {"$pull":{"racers":{"id":update.id}}});
                }
            })).then(() => process.send('update'));
        });
    } else if (msg === 'query') {
        dbP.then(db => {
            let col:Collection = db.collection('ski');
            Promise.all(queries.map(query=>col.find({"racer.id": query}))).then(() => process.send('query'));
        });
    } else if (msg === 'both') {
        dbP.then(db => {
            let col:Collection = db.collection('ski');
            Promise.all(both.map(obj => {
                if (typeof obj === "string") {
                    return col.find({id: obj});
                } else {
                    if (obj.method === 'add') {
                        return col.findOneAndUpdate({"id":obj.team}, {"$push":{"racers":obj.racer}});
                    } else {
                        return col.findOneAndUpdate({"racer.id":obj.id}, {"$pull":{"racers":{"id":obj.id}}});
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