// Tracker-only mirror of the existing iOS standard Focus action.
// Source: Statr/Core/Models/StatrModels.swift (BetMode.prompt, Sport.categories,
// CompileRequest) and Statr/App/AppModel.swift (analysisRequestMessage/jobRequest).
// No app or shared-backend behavior is changed by this adapter.
export const MANUAL_MARKET_PROMPTS = Object.freeze({
  moneyline: "Analyze the moneyline for this matchup, including price, movement, injuries, and matchup evidence.",
  spread: "Analyze the spread or run line for this matchup and identify the strongest evidence on either side.",
  total: "Analyze the game total and the evidence for the over and under.",
});
const CATEGORIES = {
  nfl: ["overview","moneylineanalysis","moneylinemovement","pointspreadanalysis","pointspreadlinemovement","overunderanalysis","overunderlinemovement","matchupstats","playerstats","efficiencystats","statsplits","powerratings","similargamesanalysis","situationaltrends","travelanalysis","dualgamelog","headtohead"],
  mlb: ["moneylineanalysis","moneylinemovement","runlineanalysis","pointspreadanalysis","overunderanalysis","overunderlinemovement","matchupstats","efficiencystats","statsplits","dualgamelog","headtohead","lineups","injuryreport","powerratings","travelanalysis","overview","situationaltrends","odds","playerstats","dkhandle"],
};

export function manualCompileRequest({sport, matchupId, market}) {
  if (!CATEGORIES[sport] || !MANUAL_MARKET_PROMPTS[market]) throw new Error("Unsupported manual analysis market or sport.");
  const parts = matchupId.split("/");
  return {
    matchupId, categories:[...CATEGORIES[sport]], sport, league:sport, betMode:market,
    ...(sport === "nfl" ? {year:Number(parts[1]),week:parts[2].replace("week",""),matchup:parts.slice(3).join("/")} : {}),
    players:[], prop:"", sideOrTotal:"", prompt:MANUAL_MARKET_PROMPTS[market],
    includeRaw:true, indexVector:true, returnCompiled:true,
  };
}

export function manualJobRequest({sport,matchupId,matchupLabel,market,compiled,conversationId}) {
  const compile = manualCompileRequest({sport,matchupId,market});
  const vector = compiled?._statgptVector || {};
  const context = {sport,sportLabel:sport.toUpperCase(),matchupId,matchupLabel,betMode:market,sideOrTotal:""};
  const displayMessage = `${{moneyline:"Moneyline",spread:"Spread",total:"Over/Under"}[market]} analysis — ${matchupLabel}`;
  return {
    ...context, promptText:compile.prompt, userMessage:"Start Analysis",
    displayMessage,
    compiledText:compiled?.compiledMarkdown || JSON.stringify(compiled), categories:compile.categories,
    responseMode:"analysis", intent:"analysis_request", liveContextRequested:false,
    conversationId, recentMessages:[{role:"user",content:displayMessage}], players:[], prop:"",
    vectorContext:vector, statgptVector:vector, vectorStoreId:vector.vectorStoreId || "",
    openaiFileId:vector.openaiFileId || "", vectorFileId:vector.openaiFileId || "",
    markdownHash:vector.markdownHash || "", stablePacketHash:vector.stablePacketHash || "",
    vectorStoreStatus:vector.vectorStoreStatus || "",
    activeContext:context,
    contextLock:{activeSport:sport,activeMatchupId:matchupId,activeMatchupLabel:matchupLabel,activeBetMode:market},
  };
}
