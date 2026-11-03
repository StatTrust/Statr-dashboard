import test from "node:test";
import assert from "node:assert/strict";
import {manualCompileRequest,manualJobRequest} from "../lib/manualAnalysisRequest.js";

// Native baseline: Sport.categories / BetMode.prompt / CompileRequest in
// ios/Statr/Statr/Core/Models/StatrModels.swift; standard Focus submission in
// ios/Statr/Statr/App/AppModel.swift, inspected 2026-11-03.
const expectedPrompts = {
  moneyline:"Analyze the moneyline for this matchup, including price, movement, injuries, and matchup evidence.",
  spread:"Analyze the spread or run line for this matchup and identify the strongest evidence on either side.",
  total:"Analyze the game total and the evidence for the over and under.",
};
const nflCategories = ["overview","moneylineanalysis","moneylinemovement","pointspreadanalysis","pointspreadlinemovement","overunderanalysis","overunderlinemovement","matchupstats","playerstats","efficiencystats","statsplits","powerratings","similargamesanalysis","situationaltrends","travelanalysis","dualgamelog","headtohead"];
for(const market of Object.keys(expectedPrompts)) {
  test(`${market}: tracker matches the native standard market-action contract`,()=>{
    const context={sport:"nfl",market,matchupId:"nfl/2026/week9/chiefs_broncos",matchupLabel:"KC @ DEN"};
    const compile=manualCompileRequest(context);
    assert.deepEqual(compile,{
      matchupId:context.matchupId,categories:nflCategories,sport:"nfl",league:"nfl",betMode:market,
      year:2026,week:"9",matchup:"chiefs_broncos",players:[],prop:"",sideOrTotal:"",
      prompt:expectedPrompts[market],includeRaw:true,indexVector:true,returnCompiled:true,
    });
    const vector={vectorStoreId:"vs_saved",openaiFileId:"file_saved",markdownHash:"hash",stablePacketHash:"hash",vectorStoreStatus:"completed"};
    const compiled={compiledMarkdown:"# Complete packet",_statgptVector:vector};
    const job=manualJobRequest({...context,compiled,conversationId:"auto_example"});
    assert.equal(job.promptText,expectedPrompts[market]);
    assert.equal(job.userMessage,"Start Analysis");
    assert.equal(job.compiledText,compiled.compiledMarkdown);
    assert.equal(job.intent,"analysis_request");
    assert.equal(job.responseMode,"analysis");
    assert.equal(job.betMode,market);
    assert.equal(job.liveContextRequested,false);
    assert.deepEqual(job.categories,nflCategories);
    assert.deepEqual(job.vectorContext,vector);
    assert.equal(job.vectorFileId,"file_saved");
    assert.equal(job.stablePacketHash,"hash");
    assert.deepEqual(job.activeContext,{sport:"nfl",sportLabel:"NFL",matchupId:context.matchupId,matchupLabel:"KC @ DEN",betMode:market,sideOrTotal:""});
    assert.equal(job.contextLock.activeBetMode,market);
    assert.deepEqual(job.recentMessages,[{role:"user",content:job.displayMessage}]);
    for(const field of ["model","temperature","reasoningEffort","researchRestrictions","compiled"])assert.equal(field in job,false);
  });
}
test("legacy tracker environment overrides cannot change the manual request",()=>{
  process.env.STATR_ANALYSIS_PROMPT="Different instructions";
  process.env.STATR_ANALYSIS_MESSAGE="Say No Signal";
  process.env.STATR_LIVE_CONTEXT="1";
  const job=manualJobRequest({sport:"nfl",market:"spread",matchupId:"nfl/2026/week9/chiefs_broncos",matchupLabel:"KC @ DEN",compiled:{}});
  assert.equal(job.promptText,expectedPrompts.spread);
  assert.equal(job.userMessage,"Start Analysis");
  assert.equal(job.liveContextRequested,false);
});
test("unsupported sports and markets cannot silently select another analysis",()=>{
  assert.throws(()=>manualCompileRequest({sport:"nba",market:"spread"}));
  assert.throws(()=>manualCompileRequest({sport:"nfl",market:"any"}));
});
