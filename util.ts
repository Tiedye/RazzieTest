"use strict";
import {IndependentRacer, Racer} from './schema';

export function randString(len:number):string {
    return Buffer.from([...(function *() {
        for(let i = 0; i < len; ++i) {
            yield Math.floor(Math.random() * 90 + 32);
        }
    })()]).toString();
}

export function genId(id:number):string {
    return ('00000000'+id).slice(-8);
}

export function shuffle<T>(array:Array<T>):Array<T>{
    var index = array.length, item:T, swap:number;
    while (index) {
        swap = Math.floor(Math.random() * index--);
        item = array[index];
        array[index] = array[swap];
        array[swap] = item;
    }
    return array;
}

export function generateIndependentRacer (team:string, id:string):IndependentRacer {
    return new IndependentRacer(
        team, randString(7), randString(7), Math.random() * 10 + 7,
        Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10,
        randString(30), Math.random() > 0.5, id);

}

export function generateRacer(id:string):Racer {
    return new Racer(
        randString(7), randString(7), Math.random() * 10 + 7,
        Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10,
        randString(30), Math.random() > 0.5, id);
}