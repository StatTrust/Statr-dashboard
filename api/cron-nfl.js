import {json, requireCronAuth, runDueAnalyses, pollQueuedAnalyses, settleDate} from "../lib/statrMlb.js";
export const config = {maxDuration:300};

export default async function handler(req, res) {
  if (!["GET","POST"].includes(req.method)) return json(res,405,{error:"Method not allowed"});
  const error = requireCronAuth(req);
  if (error) return json(res,401,{error});
  try {
    const task = req.query?.task || "due";
    if (!["due","poll","settle"].includes(task)) return json(res,400,{error:"Invalid task"});
    const options = {sport:"nfl"};
    const result = await ({due:runDueAnalyses,poll:pollQueuedAnalyses,settle:settleDate}[task])(options);
    return json(res,200,{ok:true,...result});
  } catch (error) { return json(res,500,{error:String(error.message)}); }
}
