"use strict";

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