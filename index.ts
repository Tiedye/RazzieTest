"use strict";

import {fork, ChildProcess} from 'child_process';
import {IndependentRacer, Racer, Team} from './schema';
import {randString, genId} from './util';
import {MongoClient, Db, Collection} from 'mongodb';
let async = require("async");

const enum DBMode {
    RacerTable = 1,
    TeamTable
}

let threadCount:number = 1;
let teams:number = 20;
let racersATeam:number = 20;
let mode:DBMode = DBMode.RacerTable;
let updateQueryRatio:number = 1;
let accessCount = 100;

// Get args (populates the above variables)
process.argv.slice(2).map((arg:string) => {
    if (/^--threads=\d+/.test(arg)) {
        threadCount = parseInt(arg.match(/([^=]+)$/)[0]);
    } else if (/^--teams=\d+/.test(arg)) {
        teams = parseInt(arg.match(/([^=]+)$/)[0]);
    } else if (/^--racers-team=\d+/.test(arg)) {
        racersATeam = parseInt(arg.match(/([^=]+)$/)[0]);
    } else if (/^--accesses=\d+/.test(arg)) {
        accessCount = parseInt(arg.match(/([^=]+)$/)[0]);
    } else if (/^--mode=[1|2]+/.test(arg)) {
        mode = parseInt(arg.match(/([^=]+)$/)[0]);
    } else if (/^--ratio=(?:\d+|\.\d+|\d+\.\d+)(?:[eE][+-]?\d+)?/.test(arg)) {
        updateQueryRatio = Number(arg.match(/([^=]+)$/)[0]);
    } else if (/^--?h(?:elp)?/.test(arg)) {
        console.log("Options:");
        console.log("  --threads       number of threads to test with");
        console.log("  --accesses      number of requests to make from each thread at each stage");
        console.log("  --teams         number of teams to generate");
        console.log("  --racers-team   number of racers per team");
        console.log("  --mode          storage model (1 -> records per racer or 2 -> record per team)");
        console.log("  --ratio         ratio of updates to queries during the test");
        console.log("  --help          shows this message");
    } else {
        console.log("Invalid Option: " + arg);
    }
});

console.log(`Threads: ${threadCount}, Teams: ${teams}, Racers/Team: ${racersATeam}, ` +
    `Mode: ${mode == 1 ? "RacerTable" : "TeamTable"}, Ratio: ${updateQueryRatio}, Accesses: ${accessCount}`);

// Open connection to database to create initial state
MongoClient.connect('mongodb://localhost:27017/' + (mode == DBMode.RacerTable ? 'racer' : 'team')).then((db:Db)=> {

    let col:Collection = db.collection('ski');
    
    // delete the collection and then repopulate it
    col.drop().catch(err => err).then(() => {
        console.log('Start DB Creation');
        console.time('Create DB');
        let completedCreation:Promise<any>;
        if (mode == DBMode.RacerTable) {
            let toAdd:Array<IndependentRacer> = new Array<IndependentRacer>();
            for (let team = 0; team < teams; ++team) {
                // generate random team id
                let teamId = genId(team);
                for (let racer = 0; racer < racersATeam; ++racer) {
                    // generate random racer
                    toAdd.push(new IndependentRacer(
                        teamId, randString(7), randString(7), Math.random() * 10 + 7,
                        Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10,
                        randString(30), Math.random() > 0.5, genId(team * racersATeam + racer)));
                }
            }
            console.log('Racer Obj Created, Inserting');
            completedCreation = Promise.all([col.insertMany(toAdd), col.createIndex('id')]);
        } else {
            let toAdd:Array<Team> = new Array<Team>();
            for (let team = 0; team < teams; ++team) {
                // create team, generate random id
                let newTeam:Team = new Team(genId(team), []);
                toAdd.push(newTeam);
                for (let racer = 0; racer < racersATeam; ++racer) {
                    // add random racers to team
                    newTeam.racers.push(new Racer(
                        randString(7), randString(7), Math.random() * 10 + 7,
                        Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10,
                        randString(30), Math.random() > 0.5, genId(team * racersATeam + racer)));
                }
            }
            console.log('Teams Obj Created, Inserting');
            completedCreation = Promise.all([col.insertMany(toAdd), col.createIndex('racers.id'), col.createIndex('id')]);
        }
        // once the db has been created, run our tests
        completedCreation.then(() => {
            console.timeEnd('Create DB');

            // create the threads that will access the database
            let threads:Array<ChildProcess> = new Array<ChildProcess>();
            console.log("Creating Threads");
            for (let i = 0; i < threadCount; ++i) {
                let new_child:ChildProcess;
                if (mode == DBMode.RacerTable) {
                    new_child = fork('./stress-test-racer');
                } else if (mode == DBMode.TeamTable) {
                    new_child = fork('./stress-test-team');
                }
                new_child.send({
                    type:             'generate',
                    teams:            teams,
                    racersATeam:      racersATeam,
                    updateQueryRatio: updateQueryRatio,
                    thisThreadNum:    i,
                    totalThreads:     threadCount,
                    accessCount:      accessCount
                });
                threads.push(new_child);
            }
            // run the three tests once after another
            async.series([
                (callback:(err:Error)=>void) => {
                    Promise.all(threads.map(thread=>new Promise((resolve, reject)=> {
                        thread.once('message', (msg:string) => msg === 'ready' ? resolve() : reject())
                    }))).then(() => {
                        console.log('All Threads Ready');
                        callback(null);
                    }).catch(() => callback(new Error('Thread Error')));
                },
                (callback:(err:Error)=>void) => {
                    console.time("Update from all Threads");
                    Promise.all(threads.map(thread=>new Promise((resolve, reject)=> {
                        thread.send('update');
                        thread.once('message', (msg:string) => msg === 'update' ? resolve() : reject());
                    }))).then(() => {
                        console.timeEnd("Update from all Threads");
                        callback(null);
                    }).catch(() => callback(new Error('Thread Error')));
                },
                (callback:(err:Error)=>void) => {
                    console.time("Query from all Threads");
                    Promise.all(threads.map(thread=>new Promise((resolve, reject)=> {
                        thread.send('query');
                        thread.once('message', (msg:string) => msg === 'query' ? resolve() : reject());
                    }))).then(()=> {
                        console.timeEnd("Query from all Threads");
                        callback(null);
                    }).catch(() => callback(new Error('Thread Error')));
                },
                (callback:(err:Error)=>void) => {
                    console.time("Update and Query from all Threads");
                    Promise.all(threads.map(thread=>new Promise((resolve, reject)=> {
                        thread.send('both');
                        thread.once('message', (msg:string) => msg === 'both' ? resolve() : reject());
                    }))).then(()=> {
                        console.timeEnd("Update and Query from all Threads");
                        callback(null);
                    }).catch(() => callback(new Error('Thread Error')));
                },
                (callback:(err:Error)=>void) => {
                    threads.map((thread:ChildProcess)=>thread.disconnect());
                    db.close();
                    callback(null);
                }
            ]);
        });
    });
});


