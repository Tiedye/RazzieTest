"use strict";

export class Racer {

    // 10 arbitrary fields
    constructor(public first_name:string,
                public last_name:string,
                public age:number,
                public skill_flexibility:number,
                public skill_strength:number,
                public skill_sl_technique:number,
                public skill_gs_technique:number,
                public note:string,
                public paid:boolean,
                public id:string) {
    }
}

export class IndependentRacer extends Racer {

    constructor(public teamId:string,
                first_name:string,
                last_name:string,
                age:number,
                skill_flexibility:number,
                skill_strength:number,
                skill_sl_technique:number,
                skill_gs_technique:number,
                note:string,
                paid:boolean,
                id:string) {
        super(first_name,
            last_name,
            age,
            skill_flexibility,
            skill_strength,
            skill_sl_technique,
            skill_gs_technique,
            note,
            paid,
            id);
    }
}

export class Team {
    constructor(public id:string, public racers:Array<Racer>) {}
}