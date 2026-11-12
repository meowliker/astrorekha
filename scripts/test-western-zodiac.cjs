const assert = require('node:assert/strict');
const Module = require('node:module');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({module:'CommonJS',moduleResolution:'node'});
process.env.REPORT_SESSION_SECRET = 'unit-test-only';
require('ts-node/register');
require('tsconfig-paths').register({baseUrl:process.cwd(),paths:{'@/*':['src/*']}});
const samples = require('./fixtures/western-charts.json');
const {westernChart,getWesternSignsFromChart,WESTERN_CHART_VERSION,westernChartDetails} = require('../src/lib/western-zodiac');
const {getVedicSignsFromChart} = require('../src/lib/vedic-signs');
const tables = {}, writes = [], aiCalls = [];
let engineCalls=0, engineFails=false, market='US';
const db={from(table){
  let filters=[],operation=null,payload=null,maximum=null;
  const query={
    select(){return query},eq(k,v){filters.push(r=>r[k]===v);return query},order(){return query},limit(n){maximum=n;return query},
    upsert(p){operation='upsert';payload=p;return query},insert(p){operation='insert';payload=p;return query},update(p){operation='update';payload=p;return query},
    maybeSingle(){return execute(true)},single(){return execute(true)},then(a,b){return execute(false).then(a,b)},
  };
  async function execute(single){
    tables[table] ||= [];
    if(operation){
      writes.push(table);
      if(operation==='update') tables[table].filter(r=>filters.every(f=>f(r))).forEach(r=>Object.assign(r,payload));
      else {
        const old=operation==='upsert'&&tables[table].find(r=>payload.id ? r.id===payload.id : r.user_id===payload.user_id);
        if(old) Object.assign(old,payload);
        else tables[table].unshift({id:payload.id||`report-${writes.length}`,...payload});
      }
    }
    let rows=tables[table].filter(r=>filters.every(f=>f(r)));
    if(maximum) rows=rows.slice(0,maximum);
    return {data:single?(rows[0]||null):rows,error:null};
  }
  return query;
}};
const load=Module._load;
Module._load=function(id,parent,isMain){
 if(id==='@/lib/user-profile')return {calculateZodiacSign:()=>{throw new Error('US must not use legacy date-only zodiac')}};
 if(id==='@anthropic-ai/sdk')return class Anthropic {};
 if(id==='next/cache')return {unstable_noStore:()=>{}};
 if(id==='@/lib/supabase-admin')return {getSupabaseAdmin:()=>db};
 if(id==='@/lib/supabase')return {supabase:db};
 if(id==='@/lib/customer-market')return {customerMarket:async()=>market};
 if(id==='@/lib/astro-client')return {fetchFromAstroEngine:async(path,input)=>{
  engineCalls++;if(engineFails)throw Error('engine unavailable');
  assert.equal(path,'/calculate');
  const sample=samples.find(x=>x.input.year===input.year&&x.input.month===input.month&&x.input.day===input.day&&x.input.hour===input.hour&&x.input.minute===input.minute&&x.input.place===input.place);
  assert.ok(sample,`Missing test ephemeris fixture: ${JSON.stringify(input)}`);return structuredClone(sample);
 }};
 if(id==='@/lib/anthropic')return {anthropic:{messages:{create:async input=>{aiCalls.push(input);return {id:'mock',usage:{},content:[{type:'text',text:'Your Pisces Sun and Taurus Moon describe complementary themes.'}]}}}}};
 if(id==='@/lib/ai-usage-logger')return {logClaudeUsage:async()=>{}};
 if(id==='@/lib/birth-chart-report-generator')return {generateBirthChartReport:async()=>({sections:{ascendant_nature:'Existing Indian generator'}})};
 return load.call(this,id,parent,isMain);
};
const {NextRequest}=require('next/server');
const {createReportSession}=require('../src/lib/report-session');
function req(path,body,uid='us-user'){
 const headers={'content-type':'application/json',cookie:`ar_access=${uid}; ar_report_session=${createReportSession(uid)}`};
 return new NextRequest(`http://localhost${path}`,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});
}
const birth={birthMonth:'March',birthDay:'9',birthYear:'2000',birthHour:'12',birthMinute:'0',birthPeriod:'PM',birthPlace:'New York, USA',knowsBirthTime:true};
const profile={id:'us-user',birth_month:'March',birth_day:'9',birth_year:'2000',birth_hour:'12',birth_minute:'0',birth_period:'PM',birth_place:'New York, USA',knows_birth_time:true};
async function main(){
 const expected=[['Pisces','Taurus','Cancer'],['Pisces','Cancer','Gemini'],['Pisces','Cancer','Cancer'],['Cancer','Gemini','Libra'],['Pisces','Aries','Sagittarius'],['Pisces','Taurus','Libra']];
 for(const [i,s] of samples.entries()){
  const signs=getWesternSignsFromChart(s.chart);assert.deepEqual(Object.values(signs),expected[i]);
  const clean=westernChart(s.chart,true), json=JSON.stringify(clean);
  assert.equal(clean.sun_sign,expected[i][0]);assert.equal(clean.moon_sign,expected[i][1]);assert.equal(clean.ascendant,expected[i][2]);
  assert.doesNotMatch(json,/sidereal|nakshatra|ayanamsa|Rahu|Ketu|dasha/);
  assert.ok(clean.planets['South Node']);assert.ok(clean.houses['1']);
  assert.deepEqual(westernChartDetails(clean).planetary_columns,['sign','house']);
 }
 assert.equal(getVedicSignsFromChart(samples[0].chart).sun,'Aquarius','Indian March 9 must remain Vedic Aquarius');
 const unknown=westernChart(samples[0].chart,false);
 assert.equal(unknown.sun_sign,'Pisces');assert.equal(unknown.moon_sign,null);assert.equal(unknown.ascendant,null);
 assert.equal(unknown.planets.Moon,undefined);assert.deepEqual(unknown.houses,{});assert.deepEqual(unknown.aspects,[]);
 assert.ok(Object.values(unknown.planets).every(p=>p.house===null));
 assert.equal(getWesternSignsFromChart({planets:{Sun:{sidereal:{sign:'Pisces'}}}}),null);
 const boundary=structuredClone(samples[0].chart);boundary.planets.Sun.tropical.total_longitude=360;
 assert.equal(getWesternSignsFromChart(boundary).sun,'Aries');
 boundary.planets.Sun.tropical.total_longitude=NaN;assert.equal(getWesternSignsFromChart(boundary),null);
 // Calendar/DST values are captured from the real Swiss Ephemeris service, not invented sign tables.
 const offset=s=>Math.round((Date.UTC(s.input.year,s.input.month-1,s.input.day,s.input.hour,s.input.minute)-(s.chart.birth_data.julian_day-2440587.5)*86400000)/60000)/60;
 assert.equal(offset(samples[1]),-4);assert.equal(offset(samples[2]),-5);assert.equal(offset(samples[3]),5.5);
 const {calculateWesternChart,loadWesternAccountChart}=require('../src/lib/us-main/western-chart');
 const a=await calculateWesternChart(birth), calls=engineCalls;
 assert.equal((await calculateWesternChart(birth)).id,a.id);assert.equal(engineCalls,calls,'cached chart should not recalculate');
 const midnight=await calculateWesternChart({...birth,birthPeriod:'AM'});
 const evening=await calculateWesternChart({...birth,birthHour:'8'});
 assert.notEqual(midnight.id,a.id);assert.notEqual(evening.id,a.id);
 assert.equal(midnight.data.moon_sign,'Aries');assert.equal(evening.data.ascendant,'Libra');
 const b=await calculateWesternChart({...birth,knowsBirthTime:false});assert.notEqual(a.id,b.id);
 await assert.rejects(calculateWesternChart({...birth,birthDay:31,birthMonth:2}));
 await assert.rejects(calculateWesternChart({...birth,birthHour:25}));
 await assert.rejects(calculateWesternChart({...birth,birthPlace:''}));
 tables.users=[{...profile,sun_sign:'Aquarius',moon_sign:'Aries',unlocked_features:{birthChart:true,pastLifeReport:true,astrocartographyReport:true}}];
 tables.user_profiles=[{...profile,sun_sign:'Aquarius',moon_sign:'Aries'}];
 assert.equal((await loadWesternAccountChart('us-user')).data.sun_sign,'Pisces');
 const signsRoute=require('../src/app/api/astrology/signs/route');
 const us=await (await signsRoute.POST(req('/api/astrology/signs',birth))).json();
 assert.equal(us.sunSign.name,'Pisces');assert.equal(us.moonSign.name,'Taurus');assert.equal(us.ascendant.name,'Cancer');assert.equal(us.rulingPlanet,'Neptune');
 const anon=new NextRequest('http://localhost/api/astrology/signs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...birth,zodiacSystem:'western'})});
 assert.equal((await (await signsRoute.POST(anon)).json()).sunSign.name,'Pisces');
 assert.equal((await (await signsRoute.POST(req('/api/astrology/signs',{...birth,zodiacSystem:'vedic'}))).json()).sunSign.name,'Aquarius','Indian funnel stays Vedic even for a signed-in US account');
 market='IN';
 const india=await (await signsRoute.POST(req('/api/astrology/signs',birth,'in-user'))).json();
 assert.equal(india.sunSign.name,'Aquarius');assert.equal(india.rulingPlanet,'Saturn');
 market='US';
 const {generateWesternBirthReport}=require('../src/lib/us-main/western-report');
 const generated=await generateWesternBirthReport(a.data,'us-user','test');
 assert.equal(Object.keys(generated.sections).length,11);
 assert.ok(aiCalls.every(c=>c.system.includes('Western tropical')&&c.messages[0].content.includes('Pisces')&&!/nakshatra|sidereal/.test(c.messages[0].content)));
 tables.birth_chart_reports=[{id:'old',user_id:'us-user',status:'complete',birth_chart_id:'vedic-old',sections:{ascendant_nature:'Old sidereal report'}}];
 const status=require('../src/app/api/birth-chart-report/status/route');
 assert.equal((await (await status.GET(req('/status'))).json()).status,'not_started');
 const generate=require('../src/app/api/birth-chart-report/generate/route');
 const response=await generate.POST(req('/generate',{}));assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.sections._zodiac_system,WESTERN_CHART_VERSION);
 assert.equal((await (await status.GET(req('/status'))).json()).status,'complete');
 tables.user_profiles[0].knows_birth_time=false;
 assert.equal((await (await status.GET(req('/status'))).json()).status,'not_started','birth-detail changes invalidate old report');
 tables.user_profiles[0].knows_birth_time=true;
 const view=require('../src/app/api/birth-chart-report/[id]/route');
 assert.equal((await view.GET(req('/report'),{params:Promise.resolve({id:'old'})})).status,409);
 const {buildPastLifeReport}=require('../src/lib/past-life-report');
 const past=buildPastLifeReport({userId:'us-user',userProfile:tables.user_profiles[0],user:tables.users[0],westernChart:a.data});
 assert.equal(past.birthData.sunSign,'Pisces');assert.equal(past.chartSignals.method,'western-south-node');
 assert.equal(past.chartSignals.ketu.planet,'South Node');assert.doesNotMatch(JSON.stringify(past),/Vedic|Ketu in|Rahu in/);
 const account=require('../src/app/api/account/zodiac/route');
 assert.equal((await account.GET(new NextRequest('http://localhost/api/account/zodiac'))).status,401);
 market='IN';assert.deepEqual(await (await account.GET(req('/api/account/zodiac'))).json(),{western:false});
 market='US';assert.equal((await (await account.GET(req('/api/account/zodiac'))).json()).sun,'Pisces');
 const partner=require('../src/app/api/us/main/astrology/chart/route');
 assert.equal((await partner.POST(new NextRequest('http://localhost/api/us/main/astrology/chart',{method:'POST',body:'{}'}))).status,401);
 assert.equal((await partner.POST(req('/api/us/main/astrology/chart',{...birth,knowsBirthTime:false}))).status,400);
 assert.equal((await (await partner.POST(req('/api/us/main/astrology/chart',birth))).json()).data.moon_sign,'Taurus');
 market='IN';assert.equal((await partner.POST(req('/api/us/main/astrology/chart',birth))).status,403);market='US';
 for(const [table,path] of [['future_partner_reports','future-partner-report'],['past_life_reports','past-life-report'],['astrocartography_reports','astrocartography']]){
   tables[table]=[{id:'old',user_id:'us-user',status:'complete',report_data:{_zodiac_system:'vedic'}}];
   const api=require(`../src/app/api/${path}/status/route`);
   assert.equal((await (await api.GET(req('/status'))).json()).status,'not_started',`${path} rejects old Vedic report`);
   tables[table][0].report_data={_zodiac_system:WESTERN_CHART_VERSION,_birth_chart_id:'old-birth-details'};
   assert.equal((await (await api.GET(req('/status'))).json()).status,'not_started',`${path} rejects changed birth details`);
 }
 tables.users[0].unlocked_features.palmReading=true;
 const palm=require('../src/app/api/palm-reading/route');
 tables.palm_readings=[{id:'us-user',palm_image_url:'saved-palm-test',reading:{tabs:{},cosmicInsight:'Old Aquarius'}}];
 let palmResult=await (await palm.GET(req('/palm'))).json();assert.equal(palmResult.reading,null);assert.equal(palmResult.image,'saved-palm-test');
 tables.palm_readings[0].reading={tabs:{},cosmicInsight:'Pisces',_zodiac_system:WESTERN_CHART_VERSION,_birth_chart_id:a.id};
 palmResult=await (await palm.GET(req('/palm'))).json();assert.equal(palmResult.reading.cosmicInsight,'Pisces');
 market='IN';tables.palm_readings[0].reading={tabs:{},cosmicInsight:'Existing Indian reading'};
 assert.equal((await (await palm.GET(req('/palm'))).json()).reading.cosmicInsight,'Existing Indian reading');market='US';
 engineFails=true;tables.birth_charts=[];
 assert.equal((await account.GET(req('/api/account/zodiac'))).status,503,'Engine failure must not return a saved Vedic sign');
 assert.ok(!writes.some(x=>/orders|payments|coins|features|users|user_profiles/.test(x)),'no payment, unlock, coin, or account mutations');
 console.log('PASS: tropical Sun/Moon/Ascendant, Lahiri isolation, unknown time, DST, validation, separate caches, saved-report invalidation, generation prompts, report access, and no payment mutations.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
