(() => {
"use strict";
const $=id=>document.getElementById(id);
const labels={CHEST:"سینه",TRAPEZIUS:"ذوزنقه‌ای",RHOMBOIDS:"لوزی",LATS:"پشت پهن",BACK_LOWER:"فیله کمر",SHOULDERS_FRONT:"سرشانه جلویی",SHOULDERS_SIDE:"سرشانه میانی",SHOULDERS_REAR:"سرشانه خلفی",BICEPS:"جلو بازو",TRICEPS:"پشت بازو",FOREARMS:"ساعد",CORE:"شکم",OBLIQUES:"مورب شکمی",GLUTES:"سرینی",QUADS:"چهارسر ران",HAMSTRINGS:"همسترینگ",CALVES:"ساق پا",ADDUCTORS:"نزدیک‌کننده ران",ABDUCTORS:"دورکننده ران"};
const categories=[{id:"ALL",name:"همه"},{id:"CHEST",name:"سینه"},{id:"BACK",name:"پشت"},{id:"SHOULDERS",name:"سرشانه"},{id:"ARMS",name:"بازو"},{id:"LEGS",name:"پا"},{id:"CORE",name:"شکم"}];
const exercises=[
{id:"bench",name:"پرس سینه هالتر",en:"Barbell Bench Press",cat:"CHEST",primary:["CHEST"],secondary:["SHOULDERS_FRONT","TRICEPS"],tertiary:["CORE"]},
{id:"incline",name:"پرس بالاسینه دمبل",en:"Incline Dumbbell Press",cat:"CHEST",primary:["CHEST"],secondary:["SHOULDERS_FRONT","TRICEPS"]},
{id:"decline",name:"پرس زیرسینه",en:"Decline Bench Press",cat:"CHEST",primary:["CHEST"],secondary:["TRICEPS"]},
{id:"fly",name:"قفسه سینه دمبل",en:"Dumbbell Fly",cat:"CHEST",primary:["CHEST"],secondary:["SHOULDERS_FRONT"]},
{id:"cablefly",name:"قفسه سیم‌کش",en:"Cable Fly",cat:"CHEST",primary:["CHEST"],secondary:["SHOULDERS_FRONT"]},
{id:"pushup",name:"شنا سوئدی",en:"Push-up",cat:"CHEST",primary:["CHEST"],secondary:["SHOULDERS_FRONT","TRICEPS","CORE"]},
{id:"pullover",name:"پول‌اور دمبل",en:"Dumbbell Pullover",cat:"CHEST",primary:["CHEST","LATS"],secondary:["TRICEPS"]},
{id:"row",name:"زیربغل هالتر خم",en:"Bent-over Barbell Row",cat:"BACK",primary:["LATS","RHOMBOIDS"],secondary:["BICEPS","TRAPEZIUS","BACK_LOWER"]},
{id:"latpulldown",name:"لت سیم‌کش از جلو",en:"Lat Pulldown",cat:"BACK",primary:["LATS"],secondary:["BICEPS","RHOMBOIDS"]},
{id:"pullup",name:"بارفیکس",en:"Pull-up",cat:"BACK",primary:["LATS"],secondary:["BICEPS","FOREARMS","CORE"]},
{id:"seatedrow",name:"قایقی سیم‌کش",en:"Seated Cable Row",cat:"BACK",primary:["LATS","RHOMBOIDS"],secondary:["BICEPS","TRAPEZIUS"]},
{id:"tbar",name:"تی‌بار رو",en:"T-Bar Row",cat:"BACK",primary:["LATS","RHOMBOIDS"],secondary:["BICEPS","TRAPEZIUS","BACK_LOWER"]},
{id:"deadlift",name:"ددلیفت",en:"Deadlift",cat:"BACK",primary:["GLUTES","HAMSTRINGS","BACK_LOWER"],secondary:["TRAPEZIUS","FOREARMS","QUADS"]},
{id:"pulldownstraight",name:"پول‌داون دست صاف",en:"Straight-arm Pulldown",cat:"BACK",primary:["LATS"],secondary:["TRICEPS"]},
{id:"shrug",name:"شراگ دمبل",en:"Dumbbell Shrug",cat:"BACK",primary:["TRAPEZIUS"],secondary:["FOREARMS"]},
{id:"shoulderpress",name:"پرس سرشانه دمبل",en:"Dumbbell Shoulder Press",cat:"SHOULDERS",primary:["SHOULDERS_FRONT","SHOULDERS_SIDE"],secondary:["TRICEPS","TRAPEZIUS"]},
{id:"military",name:"پرس نظامی هالتر",en:"Military Press",cat:"SHOULDERS",primary:["SHOULDERS_FRONT"],secondary:["SHOULDERS_SIDE","TRICEPS","CORE"]},
{id:"lateral",name:"نشر جانب دمبل",en:"Dumbbell Lateral Raise",cat:"SHOULDERS",primary:["SHOULDERS_SIDE"],secondary:["TRAPEZIUS"]},
{id:"frontraise",name:"نشر جلو دمبل",en:"Front Raise",cat:"SHOULDERS",primary:["SHOULDERS_FRONT"],secondary:["CHEST"]},
{id:"reversefly",name:"نشر خم / فلای معکوس",en:"Reverse Fly",cat:"SHOULDERS",primary:["SHOULDERS_REAR"],secondary:["RHOMBOIDS","TRAPEZIUS"]},
{id:"facepull",name:"فیس پول",en:"Face Pull",cat:"SHOULDERS",primary:["SHOULDERS_REAR","RHOMBOIDS"],secondary:["TRAPEZIUS"]},
{id:"upright",name:"کول هالتر",en:"Upright Row",cat:"SHOULDERS",primary:["SHOULDERS_SIDE","TRAPEZIUS"],secondary:["BICEPS"]},
{id:"curl",name:"جلو بازو هالتر",en:"Barbell Curl",cat:"ARMS",primary:["BICEPS"],secondary:["FOREARMS"]},
{id:"inclinecurl",name:"جلو بازو دمبل میز شیب‌دار",en:"Incline Dumbbell Curl",cat:"ARMS",primary:["BICEPS"],secondary:["FOREARMS"]},
{id:"hammer",name:"جلو بازو چکشی",en:"Hammer Curl",cat:"ARMS",primary:["BICEPS","FOREARMS"],secondary:[]},
{id:"preacher",name:"جلو بازو لاری",en:"Preacher Curl",cat:"ARMS",primary:["BICEPS"],secondary:["FOREARMS"]},
{id:"pushdown",name:"پشت بازو سیم‌کش",en:"Cable Triceps Pushdown",cat:"ARMS",primary:["TRICEPS"],secondary:["FOREARMS"]},
{id:"skull",name:"پشت بازو خوابیده",en:"Skull Crusher",cat:"ARMS",primary:["TRICEPS"],secondary:["SHOULDERS_FRONT"]},
{id:"overheadtri",name:"پشت بازو بالای سر",en:"Overhead Triceps Extension",cat:"ARMS",primary:["TRICEPS"],secondary:[]},
{id:"dips",name:"دیپ پارالل",en:"Parallel Bar Dips",cat:"ARMS",primary:["TRICEPS"],secondary:["CHEST","SHOULDERS_FRONT"]},
{id:"squat",name:"اسکوات هالتر",en:"Barbell Squat",cat:"LEGS",primary:["QUADS","GLUTES"],secondary:["HAMSTRINGS","CORE","BACK_LOWER"]},
{id:"legpress",name:"پرس پا",en:"Leg Press",cat:"LEGS",primary:["QUADS"],secondary:["GLUTES","ADDUCTORS"]},
{id:"extension",name:"جلو پا دستگاه",en:"Leg Extension",cat:"LEGS",primary:["QUADS"],secondary:[]},
{id:"curlleg",name:"پشت پا دستگاه",en:"Leg Curl",cat:"LEGS",primary:["HAMSTRINGS"],secondary:["CALVES"]},
{id:"rdl",name:"ددلیفت رومانیایی",en:"Romanian Deadlift",cat:"LEGS",primary:["HAMSTRINGS","GLUTES"],secondary:["BACK_LOWER","FOREARMS"]},
{id:"lunge",name:"لانج دمبل",en:"Dumbbell Lunge",cat:"LEGS",primary:["QUADS","GLUTES"],secondary:["HAMSTRINGS","CORE"]},
{id:"hipthrust",name:"هیپ تراست",en:"Hip Thrust",cat:"LEGS",primary:["GLUTES"],secondary:["HAMSTRINGS","CORE"]},
{id:"calf",name:"ساق پا ایستاده",en:"Standing Calf Raise",cat:"LEGS",primary:["CALVES"],secondary:[]},
{id:"adductor",name:"داخل ران دستگاه",en:"Hip Adduction",cat:"LEGS",primary:["ADDUCTORS"],secondary:[]},
{id:"abductor",name:"خارج ران دستگاه",en:"Hip Abduction",cat:"LEGS",primary:["ABDUCTORS"],secondary:["GLUTES"]},
{id:"crunch",name:"کرانچ شکم",en:"Crunch",cat:"CORE",primary:["CORE"],secondary:[]},
{id:"plank",name:"پلانک",en:"Plank",cat:"CORE",primary:["CORE"],secondary:["OBLIQUES","GLUTES"]},
{id:"russian",name:"چرخش روسی",en:"Russian Twist",cat:"CORE",primary:["OBLIQUES"],secondary:["CORE"]},
{id:"legraise",name:"بالا آوردن پا آویزان",en:"Hanging Leg Raise",cat:"CORE",primary:["CORE"],secondary:["OBLIQUES","FOREARMS"]}
];
let diagrams={},photos={},selectedExercise=null,selectedMuscle=null,category="ALL",region="FULL_BODY",mode="EXERCISE";
const groupRegion={UPPER_BODY:new Set(["CHEST","TRAPEZIUS","RHOMBOIDS","LATS","BACK_LOWER","SHOULDERS_FRONT","SHOULDERS_SIDE","SHOULDERS_REAR","BICEPS","TRICEPS","FOREARMS","CORE","OBLIQUES"]),LOWER_BODY:new Set(["GLUTES","QUADS","HAMSTRINGS","CALVES","ADDUCTORS","ABDUCTORS"]),CORE:new Set(["CORE","OBLIQUES","BACK_LOWER"])};
function regionGroups(){return region==="FULL_BODY"?null:groupRegion[region]}
function classFor(g){if(!selectedExercise)return selectedMuscle&&selectedMuscle.group===g?"selected":"";if(mode==="PRIMARY")return selectedExercise.primary.includes(g)?"primary":"";if(mode==="SECONDARY")return selectedExercise.secondary.includes(g)?"secondary":"";if(selectedExercise.primary.includes(g))return "primary";if(selectedExercise.secondary.includes(g))return "secondary";if(selectedExercise.tertiary&&selectedExercise.tertiary.includes(g))return "tertiary";return ""}
function makeFigure(name,title){
 const d=diagrams[name],photo=photos[name],visible=regionGroups(),box=region==="FULL_BODY"?d.viewBox:(d.regionBox&&d.regionBox[region]||d.viewBox);
 const paths=d.muscles.map(m=>{const allowed=!visible||visible.has(m.group);const cls=classFor(m.group);const sel=selectedMuscle&&selectedMuscle.group===m.group&&selectedMuscle.partId===m.id;return '<path class="muscle-path '+(allowed?cls:"")+' '+(sel?"selected":"")+'" data-group="'+m.group+'" data-part="'+(m.id||"")+'" data-side="'+(m.id&&m.id.endsWith("_LEFT")?"چپ":m.id&&m.id.endsWith("_RIGHT")?"راست":"میانی")+'" d="'+m.d+'" '+(allowed?"":'style="opacity:.08;pointer-events:none"')+'><title>'+(labels[m.group]||m.group)+'</title></path>'}).join("");
 const outline=d.outline.map(o=>'<path class="body-outline" d="'+o.d+'"/>').join("");
 const clip=d.outline.map(o=>'<path d="'+o.d+'"/>').join("");
 return '<div class="figure"><div class="figure-title">'+title+'</div><svg viewBox="'+box+'" role="img" aria-label="مدل آناتومی '+title+'"><defs><clipPath id="clip-'+name+'">'+clip+'</clipPath></defs><image href="'+photo+'" x="0" y="0" width="1024" height="1536" preserveAspectRatio="none" clip-path="url(#clip-'+name+')" style="filter:grayscale(1) brightness(1.13) contrast(.94);opacity:.96"/>'+paths+outline+'</svg></div>';
}
function renderFigures(){
 const sex=$("sex").value,view=$("view").value,names=view==="BOTH"?[sex.toLowerCase()+"-front",sex.toLowerCase()+"-back"]:[sex.toLowerCase()+"-"+view.toLowerCase()];
 $("figures").innerHTML=names.map(n=>makeFigure(n,n.endsWith("front")?"نمای جلو · Front":"نمای پشت · Back")).join("");
 $("figures").querySelectorAll(".muscle-path").forEach(p=>p.addEventListener("click",()=>{selectedMuscle={group:p.dataset.group,partId:p.dataset.part,side:p.dataset.side};showMuscleDetail();renderFigures()}));
}
function renderCategories(){$("categories").innerHTML=categories.map(c=>'<button class="chip '+(category===c.id?"active":"")+'" data-cat="'+c.id+'">'+c.name+'</button>').join("");$("categories").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{category=b.dataset.cat;renderCategories();renderExercises()}))}
function renderExercises(){
 const q=$("search").value.trim().toLowerCase(),list=exercises.filter(e=>(category==="ALL"||e.cat===category)&&(!q||(e.name+" "+e.en).toLowerCase().includes(q)));
 $("exercise-list").innerHTML=list.map(e=>'<button class="exercise '+(selectedExercise&&selectedExercise.id===e.id?"active":"")+'" data-id="'+e.id+'"><strong>'+e.name+'</strong><small>'+e.en+'</small></button>').join("")||'<div class="hint">حرکتی با این جست‌وجو پیدا نشد.</div>';
 $("exercise-list").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{selectedExercise=exercises.find(e=>e.id===b.dataset.id);selectedMuscle=null;renderExercises();showExerciseDetail();showMuscleDetail();renderFigures()}));
}
function tags(arr,kind){return arr.length?arr.map(g=>'<span class="tag '+kind+'">'+(labels[g]||g)+'</span>').join(""):'<span class="meta">—</span>'}
function showExerciseDetail(){
 if(!selectedExercise){$("exercise-detail").textContent="یک حرکت را از بانک انتخاب کن.";return}
 const e=selectedExercise;$("exercise-detail").innerHTML='<strong>'+e.name+'</strong><br><span class="en">'+e.en+'</span><div style="margin-top:8px">عضلات اصلی:</div><div class="tags">'+tags(e.primary,"primary")+'</div><div style="margin-top:8px">عضلات کمکی:</div><div class="tags">'+tags(e.secondary,"secondary")+'</div>'+(e.tertiary&&e.tertiary.length?'<div style="margin-top:8px">درگیری فرعی:</div><div class="tags">'+tags(e.tertiary,"")+'</div>':"");
}
function showMuscleDetail(){
 if(!selectedMuscle){$("muscle-detail").textContent="برای دیدن مشخصات، روی یکی از عضلات بدن بزن.";return}
 const m=selectedMuscle,related=exercises.filter(e=>e.primary.includes(m.group)||e.secondary.includes(m.group));
 $("muscle-detail").innerHTML='<strong>'+(labels[m.group]||m.group)+'</strong><br><span class="meta">'+m.side+' · شناسه: '+(m.partId||m.group)+'</span><div style="margin-top:7px">حرکت‌های مرتبط:</div><div class="muscle-buttons">'+(related.slice(0,12).map(e=>'<button class="muscle-btn" data-related="'+e.id+'">'+e.name+'</button>').join("")||"هنوز حرکتی متصل نشده است.")+'</div>';
 $("muscle-detail").querySelectorAll("[data-related]").forEach(b=>b.addEventListener("click",()=>{selectedExercise=exercises.find(e=>e.id===b.dataset.related);category="ALL";renderCategories();renderExercises();showExerciseDetail();renderFigures()}));
}
async function init(){
 const urls=["male-front","male-back","female-front","female-back"];
 const loaded=await Promise.all([fetch("./assets/diagrams.json").then(r=>{if(!r.ok)throw Error("diagrams");return r.json()}),...urls.map(n=>fetch("./assets/"+n+".webp.b64").then(r=>{if(!r.ok)throw Error(n);return r.text()}))]);
 diagrams=loaded[0];urls.forEach((n,i)=>photos[n]="data:image/webp;base64,"+loaded[i+1].trim());
 renderCategories();renderExercises();showExerciseDetail();showMuscleDetail();renderFigures();
 $("sex").addEventListener("change",renderFigures);$("view").addEventListener("change",renderFigures);$("region").addEventListener("change",()=>{region=$("region").value;renderFigures()});$("mode").addEventListener("change",()=>{mode=$("mode").value;renderFigures()});$("search").addEventListener("input",renderExercises);
 $("map-status").textContent="مدل بارگذاری شد · چهار تصویر پایه و مسیرهای مستقل جلو/پشت برای هر دو جنس.";
}
init().catch(err=>{$("figures").innerHTML='<div class="notice">بارگذاری مدل با خطا روبه‌رو شد. لطفاً بعداً دوباره امتحان کن.</div>';console.error(err)});
})();