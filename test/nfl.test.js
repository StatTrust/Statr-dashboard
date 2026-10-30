import test from "node:test";
import assert from "node:assert/strict";
import {runDueAnalyses, pollQueuedAnalyses, settleDate, scheduleRowsForGame, listPicks} from "../lib/statrMlb.js";
import {normalizeNflBoard, nflSelection} from "../lib/nflSchedule.js";
import dataHandler from "../api/nfl-data.js";
import controlHandler from "../api/analysis-control.js";

process.env.SUPABASE_URL = "https://database.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
process.env.DASHBOARD_ADMIN_SECRET = "test-admin";
const reply = data => new Response(JSON.stringify(data),{status:200});
const fixture = ({past = false, completed = false, score = [20,17]} = {}) => ({
  season:{year:2026,type:2}, week:{number:8},
  leagues:[{calendar:[{value:"2",entries:[{value:"1",label:"Week 1",detail:"September"},{value:"8",label:"Week 8",detail:"October"}]}]}],
  events:[{id:"401",date:new Date(Date.now()+(past?-1:1)*90*60000).toISOString(),
    competitions:[{status:{type:{state:completed?"post":past?"in":"pre",completed}},
      competitors:[{homeAway:"away",team:{name:"Chiefs",displayName:"Kansas City Chiefs",abbreviation:"KC"},score:score[0]},
        {homeAway:"home",team:{name:"Broncos",displayName:"Denver Broncos",abbreviation:"DEN"},score:score[1]}]}]}],
});
const fakeRes = () => ({headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}});
test("NFL controls fail closed before schedule, compile, or paid jobs", async () => {
  let count=0;
  global.fetch=async url => {count++;assert.match(String(url),/nfl_auto_analysis/);return reply([{enabled:false}]);};
  assert.equal((await runDueAnalyses({sport:"nfl"})).skipped,true);
  assert.equal(count,1);
});
test("three NFL markets use NFL identity and isolated storage; duplicates are skipped", async () => {
  const writes=[], jobs=[], boards=fixture();
  const id=normalizeNflBoard(boards).games[0].matchupId;
  let saved=[];
  global.fetch=async (url,options={}) => {
    const u=String(url);
    if(u.includes("statr_dashboard_settings")) return reply([{enabled:true}]);
    if(u.includes("statr_nfl_picks")) {
      if(options.method==="POST"){const row=JSON.parse(options.body);writes.push(row);return reply([row]);}
      return reply(saved);
    }
    assert.ok(!u.includes("statr_mlb_picks"));
    if(u.includes("espn.com")) return reply(boards);
    if(u.includes("route=registry")) return reply({matchups:[id]});
    if(u.includes("route=compile")) {assert.equal(JSON.parse(options.body).sport,"nfl");return reply({_statgptVector:{vectorStoreId:"vs_test"}});}
    if(u.includes("route=jobs")) {const job=JSON.parse(options.body); jobs.push(job);return reply({job_id:"job_"+jobs.length});}
    throw new Error(u);
  };
  await runDueAnalyses({sport:"nfl"});
  assert.equal(jobs.length,3);assert.equal(writes.length,3);
  assert.deepEqual(jobs.map(j=>j.betMode),["moneyline","spread","total"]);
  for(const j of jobs){assert.equal(j.sport,"nfl");assert.equal(j.matchupId,id);assert.equal(j.vectorStoreId,"vs_test");}
  for(const r of writes){assert.equal(r.season,2026);assert.equal(r.week,8);assert.equal(r.status,"analyzing");}
  saved=writes;
  await runDueAnalyses({sport:"nfl"});
  assert.equal(jobs.length,3);
});
test("past games cannot generate paid analyses even with force", async () => {
  global.fetch=async url => {
    const u=String(url);
    if(u.includes("statr_dashboard_settings"))return reply([{enabled:true}]);
    if(u.includes("statr_nfl_picks"))return reply([]);
    if(u.includes("espn.com"))return reply(fixture({past:true}));
    throw new Error("Unexpected paid call: "+u);
  };
  assert.equal((await runDueAnalyses({sport:"nfl",force:true})).processed.length,0);
  const game=normalizeNflBoard(fixture({past:true})).games[0];
  assert.ok(scheduleRowsForGame(game,game.officialDate).every(r=>r.status==="not_tracked"));
});
test("polling a queued NFL job writes only NFL results",async()=>{
  let patch;
  global.fetch=async(url,options={})=>{
    if(String(url).includes("route=job-status"))return reply({status:"completed",reply:"Signal: Kansas City Chiefs -3.5\nConfidence: Solid (65%)\nOdds: -110"});
    assert.match(String(url),/statr_nfl_picks/);
    if(options.method==="PATCH"){patch=JSON.parse(options.body);return reply([patch]);}
    return reply([{id:"nfl-result",job_id:"job_test",market:"spread"}]);
  };
  const result=await pollQueuedAnalyses({sport:"nfl"});
  assert.equal(result.processed[0].status,"pending");assert.equal(patch.status,"pending");
});
test("settlement handles spread, total and tied NFL moneyline without settling no-signal rows",async()=>{
  const patches=[];
  global.fetch=async(url,options={})=>{
    if(String(url).includes("espn.com"))return reply(fixture({past:true,completed:true,score:[20,20]}));
    assert.match(String(url),/statr_nfl_picks/);
    if(options.method==="PATCH"){patches.push(JSON.parse(options.body));return reply([]);}
    const base={season:2026,week:8,game_pk:"401",status:"pending",away_team:"Kansas City Chiefs",home_team:"Denver Broncos",american_odds:-110,stake:100};
    return reply([
      {...base,id:"ml",market:"moneyline",pick:"Kansas City Chiefs"},
      {...base,id:"sp",market:"spread",pick:"Denver Broncos +3.5"},
      {...base,id:"ou",market:"total",pick:"Over 40"},
      {...base,id:"pass",status:"no_signal",market:"moneyline",pick:"No Signal"},
    ]);
  };
  await settleDate({sport:"nfl"});
  assert.deepEqual(patches.map(p=>p.status),["push","won","push"]);
});
test("NFL read route merges saved records without overwriting them and validates selection",async()=>{
  const board=fixture({past:true});
  const game=normalizeNflBoard(board).games[0];
  const scheduled=scheduleRowsForGame(game,game.officialDate);
  global.fetch=async url=>String(url).includes("espn.com")?reply(board):reply([{id:scheduled[0].id,date:game.officialDate,game_pk:game.gamePk,season:2026,week:8,status:"won",market:"moneyline"}]);
  const res=fakeRes();await dataHandler({method:"GET",query:{season:2026,week:8}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.rows.length,3);
  assert.equal(res.body.rows[0].status,"won");assert.equal(res.body.rows[1].status,"not_tracked");
  assert.throws(()=>nflSelection({week:99}));
  const invalid=fakeRes();await dataHandler({method:"GET",query:{week:"bad"}},invalid);assert.equal(invalid.statusCode,400);
});
test("admin API authenticates and keeps each sport control independent",async()=>{
  const unauthorized=fakeRes();await controlHandler({method:"GET",headers:{},query:{sport:"nfl"}},unauthorized);
  assert.equal(unauthorized.statusCode,401);
  let written;
  global.fetch=async(url,options)=>{written=JSON.parse(options.body);return reply([written]);};
  const res=fakeRes();await controlHandler({method:"PATCH",headers:{authorization:"Bearer test-admin"},query:{sport:"nfl"},body:{enabled:false}},res);
  assert.equal(written.setting_key,"nfl_auto_analysis");assert.equal(res.statusCode,200);
  const nba=fakeRes();await controlHandler({method:"PATCH",headers:{authorization:"Bearer test-admin"},query:{sport:"nba"},body:{enabled:true}},nba);
  assert.equal(nba.statusCode,400);
});
test("monthly queries paginate beyond Supabase's 1000-row limit",async()=>{
  let calls=0;
  global.fetch=async url=>{calls++;return reply(Array.from({length:String(url).includes("offset=0")?1000:20},()=>({})));};
  assert.equal((await listPicks({sport:"nfl",limit:10000})).length,1020);assert.equal(calls,2);
});
