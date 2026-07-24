import { ADDR_BLOB } from "./addr.js";
import { LOGO } from "./logo.js";
import { lookupZip } from "./geocode.js";
import { localZip, localZipApprox } from "./zipdb.js";
import { BANKS, bankByCode, bankLabel, bankFromLabel, validate as validateBank } from "./bank.js";
import { BRANCHES_BY_BANK } from "./branches.js";

/* =========================================================
   פרטי העובד — מגיעים מ-employees/{id}/public/profile ב-Firestore.
   הערכים כאן הם ברירת מחדל לפיתוח מקומי בלבד.
   ========================================================= */
var SEED = {
  firstName: "גל",
  lastName:  "פדידה",
  gender:    "f",            // f / m
  mobile:    "0546389555",
  branch:    "בר אילן"
};
var remote = null;           // { employeeId, saver, submit }  — נקבע ב-startApp
var EMPLOYER = {
  name: 'שאול בטיש הלוי שאול תמרוקים בע"מ',
  address: "בר אילן 9 ירושלים",
  phone: "025402552",
  taxFile: "941784761"
};
var HR_MAIL = "saritush53@gmail.com";
var TAX_YEAR = new Date().getFullYear();
var STORE = "tofes101_shaul_v1";

/* ---------- state ---------- */
var s = {
  idNum:"", firstName:SEED.firstName, lastName:SEED.lastName, birthDate:"",
  gender:SEED.gender, bornIsrael:"", aliyaDate:"",
  street:"", houseNo:"", city:"", zip:"",
  mobile:SEED.mobile, phone:"", email:"",
  bankHolder:"", bankCode:"", bankBranch:"", bankAccount:"", bankConfirm:false,
  resident:"", kibbutz:"", hmoMember:"", hmo:"",
  marital:"", singleParentDiv:"", alimonyDiv:"",
  spouseId:"", spouseLast:"", spouseFirst:"", spouseBirth:"", spouseAliya:"", spouseIncome:"",
  hasKids:"", kids:[],
  payType:"", startDate:"",
  otherIncome:"", otherKinds:[], creditChoice:"", decl9:false, decl10:false,
  p8:{}, p8f:{},
  taxCoord:"", taxReason:"", employers:[], coordFile:"",
  signature:"", signDate:"", declConfirmed:false,
  // ---- פנסיה (נשמר בנפרד מטופס 101) ----
  penActive:"", penNoActiveConfirm:false, penActiveConfirm:false,
  penContinue:"", penContinueConfirm:false,
  penDocActive:"", penDocCubes:"", penNoDocs:false
};
// שדות חלק הפנסיה — נשמרים במסמך נפרד ואינם נכנסים לתשובות טופס 101
var PENSION_KEYS = ["penActive","penNoActiveConfirm","penActiveConfirm","penContinue","penContinueConfirm","penDocActive","penDocCubes","penNoDocs"];
var stepIdx = 0;

var FRESH = JSON.parse(JSON.stringify(s));

function scrollTop(){
  // גלילה לראש המסך. מבוצעת מיד וגם בפריים הבא, כדי לגבור על שחזור מיקום
  // הגלילה של הדפדפן אחרי בנייה מחדש של התוכן.
  var go = function(){
    window.scrollTo(0,0);
    if(document.documentElement) document.documentElement.scrollTop = 0;
    if(document.body) document.body.scrollTop = 0;
  };
  go();
  if(window.requestAnimationFrame) requestAnimationFrame(go);
}

function resetAll(){
  try{ localStorage.removeItem(STORE); }catch(e){}
  var clean = JSON.parse(JSON.stringify(FRESH));
  for(var k in clean) s[k] = clean[k];
  stepIdx = 0; screen = "welcome";
  save(); render();
  scrollTop();
}

/* ---------- persistence ----------
   מקומי: מיידי, כדי שרענון או ניתוק רשת לא יאבדו כלום.
   מרוחק: טיוטה ל-Firestore בדיבאונס, תחת employees/{id}/form101/current. */
// שדות רגישים שלא נשמרים ב-localStorage (נשמרים רק ב-Firestore, מוגן בהרשאות)
var LOCAL_EXCLUDE = ["bankAccount","bankHolder"];
// תשובות טופס 101 בלבד — ללא שדות הפנסיה (נשמרים בנפרד)
function formAnswers(){
  var o = {};
  for(var k in s){ if(PENSION_KEYS.indexOf(k)===-1) o[k]=s[k]; }
  return o;
}
// נתוני הפנסיה בלבד
function pensionAnswers(){
  var o = {};
  for(var i=0;i<PENSION_KEYS.length;i++){ o[PENSION_KEYS[i]] = s[PENSION_KEYS[i]]; }
  return o;
}
function save(){
  try{
    var local = {};
    for(var k in s){ if(LOCAL_EXCLUDE.indexOf(k)===-1) local[k]=s[k]; }
    localStorage.setItem(STORE, JSON.stringify({s:local,i:stepIdx}));
  }catch(e){}
  if(remote && remote.saver) remote.saver.queue(formAnswers(), stepIdx);
  if(remote && remote.pensionSaver && pensionOn()) remote.pensionSaver.queue(pensionAnswers());
}
function load(){
  try{
    var raw = localStorage.getItem(STORE); if(!raw) return;
    var d = JSON.parse(raw);
    if(d && d.s){ for(var k in d.s){ if(k in s) s[k]=d.s[k]; } stepIdx = d.i||0; }
  }catch(e){}
}

/* ---------- helpers ---------- */
function G(m,f){ return s.gender==="f" ? f : m; }
// גיל נכון להיום, מתוך תאריך לידה ISO (yyyy-mm-dd). null אם אין תאריך תקין.
function ageToday(iso){
  if(!iso || String(iso).indexOf("-")<0) return null;
  var p = String(iso).split("-");
  var b = new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
  if(isNaN(b.getTime())) return null;
  var t = new Date();
  var age = t.getFullYear()-b.getFullYear();
  var mm = t.getMonth()-b.getMonth();
  if(mm<0 || (mm===0 && t.getDate()<b.getDate())) age--;
  return age;
}
// חובת הפרשה פנסיונית: זכר מגיל 21, נקבה מגיל 20 (נכון להיום)
function pensionOn(){
  var age = ageToday(s.birthDate);
  if(age==null) return false;
  return s.gender==="f" ? age>=20 : age>=21;
}
function el(tag,cls,txt){ var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; }
function esc(v){ return (v==null?"":String(v)); }
function isDigits(v,n){ return new RegExp("^\\d{"+n+"}$").test(v); }

function validIsraeliId(v){
  if(!/^\d{5,9}$/.test(v)) return false;
  v = v.padStart(9,"0");
  var sum=0;
  for(var i=0;i<9;i++){
    var d = Number(v[i]) * (i%2===0 ? 1 : 2);
    sum += d>9 ? d-9 : d;
  }
  return sum%10===0;
}
function validMobile(v){ return /^05\d{8}$/.test(v.replace(/\D/g,"")); }
function validPhone(v){ return v==="" || /^0\d{8,9}$/.test(v.replace(/\D/g,"")); }
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function fmtDate(v){ if(!v) return ""; var p=v.split("-"); return p.length===3 ? p[2]+"/"+p[1]+"/"+p[0] : v; }

/* =========================================================
   מאגר יישובים ורחובות — data.gov.il (רשימת רחובות בישראל)
   ========================================================= */
var ADDR = null;
function addrData(){
  if(ADDR) return ADDR;
  var cities = [], streets = Object.create(null);
  ADDR_BLOB.split("\n").forEach(function(line){
    if(!line) return;
    var t = line.indexOf("\t");
    var c = t < 0 ? line : line.slice(0, t);
    cities.push(c);
    streets[c] = t < 0 ? "" : line.slice(t+1);
  });
  ADDR = { cities: cities, streets: streets, cache: Object.create(null) };
  return ADDR;
}
function streetsOf(city){
  var a = addrData();
  city = String(city||"").trim();
  if(!(city in a.streets)) return [];
  if(!a.cache[city]) a.cache[city] = a.streets[city] ? a.streets[city].split("|") : [];
  return a.cache[city];
}
function searchList(list, q, limit){
  q = String(q||"").trim();
  if(!q) return list.slice(0, limit);
  var starts = [], inside = [];
  for(var i=0;i<list.length;i++){
    var v = list[i], p = v.indexOf(q);
    if(p === 0) starts.push(v);
    else if(p > 0) inside.push(v);
  }
  return starts.concat(inside).slice(0, limit);
}
/* ---------- סניפי בנק (קובץ בנק ישראל הרשמי) ---------- */
function branchRows(bankCode){
  var c = String(bankCode||"").replace(/\D/g,"");
  return BRANCHES_BY_BANK[c] || BRANCHES_BY_BANK[String(Number(c))] || [];
}
function branchDisplays(bankCode){
  return branchRows(bankCode).map(function(r){
    return r[0]+" · "+r[1]+(r[2]?" · "+r[2]:"");
  });
}
function branchLabel(bankCode, branchCode){
  var bc = String(branchCode||"").replace(/\D/g,"");
  var rows = branchRows(bankCode);
  for(var i=0;i<rows.length;i++){
    if(rows[i][0]===bc || String(Number(rows[i][0]))===String(Number(bc)))
      return rows[i][0]+" · "+rows[i][1]+(rows[i][2]?" · "+rows[i][2]:"");
  }
  return bc;
}
function branchExists(bankCode, branchCode){
  var bc = String(branchCode||"").replace(/\D/g,"");
  if(!bc) return false;
  var rows = branchRows(bankCode);
  if(!rows.length) return true;               // בנק ללא נתוני סניפים — לא חוסמים
  for(var i=0;i<rows.length;i++){
    if(rows[i][0]===bc || Number(rows[i][0])===Number(bc)) return true;
  }
  return false;
}

function makeCombo(input, getList, onPick){
  var wrap = el("div","combo");
  input.autocomplete = "off";
  input.setAttribute("role","combobox");
  input.setAttribute("aria-autocomplete","list");
  input.setAttribute("aria-expanded","false");
  wrap.appendChild(input);
  var list = el("div","combo-list");
  wrap.appendChild(list);
  var items = [], active = -1;

  function close(){ list.classList.remove("open"); input.setAttribute("aria-expanded","false"); active = -1; }
  function open(){
    document.querySelectorAll(".combo-list.open").forEach(function(o){ if(o!==list) o.classList.remove("open"); });
    list.classList.add("open"); input.setAttribute("aria-expanded","true");
  }

  function draw(){
    var q = input.value;
    items = searchList(getList(), q, 40);
    list.innerHTML = "";
    if(!items.length){
      var src = getList();
      list.appendChild(el("div","combo-empty", src.length ? "לא נמצאה התאמה — אפשר להקליד ידנית" : "נא לבחור יישוב תחילה"));
      open(); return;
    }
    items.forEach(function(v,i){
      var b = el("button","combo-item"); b.type = "button";
      var p = q.trim() ? v.indexOf(q.trim()) : -1;
      if(p > -1){
        b.appendChild(document.createTextNode(v.slice(0,p)));
        b.appendChild(el("span","combo-hit", v.slice(p, p+q.trim().length)));
        b.appendChild(document.createTextNode(v.slice(p+q.trim().length)));
      } else b.textContent = v;
      b.addEventListener("mousedown", function(e){ e.preventDefault(); });
      b.onclick = function(){ pick(v); };
      list.appendChild(b);
    });
    active = -1;
    open();
  }
  function pick(v){
    input.value = v;
    onPick(v);
    close();
  }
  function highlight(){
    Array.prototype.forEach.call(list.children, function(c,i){ c.classList.toggle("active", i===active); });
    if(active > -1 && list.children[active]) list.children[active].scrollIntoView({block:"nearest"});
  }

  input.addEventListener("focus", draw);
  input.addEventListener("input", function(){ onPick(input.value); draw(); });
  input.addEventListener("blur", function(){ setTimeout(close, 130); });
  input.addEventListener("keydown", function(e){
    if(e.key === "ArrowDown"){ e.preventDefault(); if(!list.classList.contains("open")) draw(); active = Math.min(active+1, items.length-1); highlight(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); active = Math.max(active-1, 0); highlight(); }
    else if(e.key === "Enter"){
      if(list.classList.contains("open") && active > -1){ e.preventDefault(); pick(items[active]); }
      else close();
    }
    else if(e.key === "Escape"){ close(); }
  });
  return wrap;
}

/* ---------- הקלדת תאריך ידנית (בלי יומן) ---------- */
function isoToDmy(iso){
  if(!iso) return "";
  var p = String(iso).split("-");
  return p.length===3 ? p[2]+"/"+p[1]+"/"+p[0] : "";
}
function dmyToIso(v){
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v).trim());
  if(!m) return "";
  var d=+m[1], mo=+m[2], y=+m[3];
  if(mo<1||mo>12||d<1||y<1900||y>2200) return "";
  var dt = new Date(y, mo-1, d);
  if(dt.getFullYear()!==y || dt.getMonth()!==mo-1 || dt.getDate()!==d) return "";
  return m[3]+"-"+m[2]+"-"+m[1];
}
function maskDate(input, onIso, placeholder){
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.maxLength = 10;
  input.placeholder = placeholder || "יום / חודש / שנה";
  input.classList.add("date-in");
  input.addEventListener("input", function(e){
    var back = e.inputType === "deleteContentBackward";
    var digits = input.value.replace(/\D/g,"").slice(0,8);
    if(back && /\/$/.test(input.value)) digits = digits.slice(0,-1);
    var out = digits.slice(0,2);
    if(digits.length >= 2) out += (digits.length>2 || !back ? "/" : "");
    if(digits.length > 2) out += digits.slice(2,4);
    if(digits.length >= 4) out += (digits.length>4 || !back ? "/" : "");
    if(digits.length > 4) out += digits.slice(4,8);
    input.value = out;
    onIso(dmyToIso(out), out);
  });
}

function ageInTaxYear(birth){
  if(!birth) return null;
  var y = Number(birth.split("-")[0]);
  if(!y) return null;
  return TAX_YEAR - y;
}
function kidCounts(inCustody){
  var b={born:0,upTo2:0,three:0,f4to5:0,s6to17:0,e18:0};
  s.kids.forEach(function(k){
    var mine = k.custody === "yes";
    if(mine !== !!inCustody) return;
    var a = ageInTaxYear(k.birth);
    if(a===null) return;
    if(a===0) b.born++;
    else if(a>=1 && a<=2) b.upTo2++;
    else if(a===3) b.three++;
    else if(a>=4 && a<=5) b.f4to5++;
    else if(a>=6 && a<=17) b.s6to17++;
    else if(a===18) b.e18++;
  });
  return b;
}

/* =========================================================
   PART 8 — נוסח מקורי מטופס 101 (לא לשנות ניסוח)
   ========================================================= */
var PART8 = [
  {n:"1",  t:"אני תושב/ת ישראל.", locked:true},
  {n:"2א", t:"אני נכה 100% / עיוור/ת לצמיתות. מצורף אישור משרד הביטחון/האוצר/פקיד השומה/תעודת עיוור שהוצאה לאחר 1.1.94."},
  {n:"2ב", t:"בנוסף, אני מקבל/ת תגמול חודשי לפי חוק הנכים (תגמולים ושיקום) או לפי חוק התגמולים לנפגעי פעולות איבה."},
  {n:"3",  t:"אני תושב/ת קבוע/ה ביישוב מזכה. אני ובני משפחתי מדרגה ראשונה מתגוררים ביישוב, ואין לי “מרכז חיים” נוסף.",
            f:[{k:"since",l:"מתאריך",type:"date"},{k:"town",l:"שם היישוב",type:"text"}]},
  {n:"4",  t:"אני עולה חדש/ה. חובה לצרף תעודת עולה.",
            f:[{k:"aliya",l:"תאריך עלייה",type:"date"},{k:"noIncomeUntil",l:"לא הייתה לי הכנסה בישראל מתחילת שנת המס הנוכחית עד תאריך",type:"date"}]},
  {n:"5",  t:"בגין בן/בת זוגי המתגורר/ת עימי ואין לו/לה הכנסות בשנת המס."},
  {n:"6",  t:"אני הורה במשפחה חד הורית החי בנפרד, ומבקש/ת נקודות זיכוי עבור ילדיי הנמצאים בחזקתי ובגינם מקבל קצבת ילדים מהמוסד לביטוח לאומי, ואיננו מנהל משק בית משותף עם יחיד/ה אחר/ת."},
  {n:"7",  t:"בגין ילדיי שבחזקתי המפורטים בחלק ג'.", auto:"custody"},
  {n:"8",  t:"בגין ילדיי המפורטים בחלק ג' שאינם נמצאים בחזקתי.", auto:"nocustody"},
  {n:"9",  t:"אני הורה יחיד לילדיי שבחזקתי ואני משתתף/ת בכלכלתם."},
  {n:"10", t:"בגין ילדיי שאינם בחזקתי, אני ההורה החי בנפרד ומשלם/ת בגינם מזונות."},
  {n:"11", t:"אני הורה לילדים עם מוגבלות שטרם מלאו להם 19 שנים, שבגינם אני מקבל/ת גמלת ילד נכה מהמוסד לביטוח לאומי.",
            f:[{k:"count",l:"מספר הילדים",type:"number"}]},
  {n:"12", t:"בגין מזונות לבן/בת זוגי לשעבר."},
  {n:"13", t:"מלאו לי או לבן/בת זוגי 16 שנים וטרם מלאו לי או לבן/בת זוגי 18 שנים בשנת המס.", common:true},
  {n:"14", t:"אני חייל/ת משוחרר/ת / שירתתי בשירות לאומי. מצורף צילום של תעודת שחרור/סיום שירות.", common:true,
            f:[{k:"from",l:"תאריך תחילת השירות",type:"date"},{k:"to",l:"תאריך סיום השירות",type:"date"}]},
  {n:"15", t:"בגין סיום לימודים לתואר אקדמי, סיום התמחות או סיום לימודי מקצוע. מצורפת הצהרה בטופס 119.", common:true},
  {n:"16", t:"שירתתי כלוחם/לוחמת מילואים בשנת המס הקודמת. מצורף אישור מצה“ל על זכאות בעד שירות מילואים כלוחם.", common:true,
            f:[{k:"days",l:"מספר ימי מילואים",type:"number"}]}
];

var HMOS = ["מאוחדת","כללית","מכבי","לאומית"];
var PAY_TYPES = ["משכורת חודש","משכורת בעד משרה נוספת","משכורת חלקית","שכר עבודה (עובד יומי)","קצבה","מלגה"];

/* =========================================================
   STEPS
   ========================================================= */
var steps = [

/* ---------- section: identity ---------- */
{sec:"פרטים אישיים", q:function(){return SEED.firstName+", האם אלו הפרטים שלך? 😊"}, sub:"אפשר לערוך אם צריך",
 fields:[{k:"firstName",l:"שם פרטי",type:"text",half:true,v:req},
         {k:"lastName",l:"שם משפחה",type:"text",half:true,v:req},
         {k:"mobile",l:"טלפון נייד",type:"tel",mode:"tel",v:function(x){return validMobile(x)?"":"מספר נייד לא תקין (05X-XXXXXXX)"}},
         {k:"gender",l:"מגדר",type:"gender"}]},

{sec:"פרטים אישיים", q:function(){return "מהי כתובת הדוא\"ל שלך? ✉️"}, sub:"לכתובת הזאת יישלחו תלושי השכר שלך",
 fields:[{k:"email",l:"כתובת דואר אלקטרוני",type:"email",mode:"email",v:function(x){return validEmail(x)?"":"כתובת אימייל לא תקינה"}}]},

{sec:"פרטי חשבון בנק", q:function(){return "לאיזה חשבון בנק להעביר את המשכורת? 💰"}, sub:"הפרטים ישמשו להעברת שכר בלבד",
 fields:[
   {k:"bankHolder",l:"שם בעל החשבון",type:"text",v:req},
   {k:"bankCode",l:"בנק",bank:true,v:function(x){return String(x||"").trim()?"":"נא לבחור בנק מהרשימה";},
    ph:"בחירת בנק מהרשימה"},
   {k:"bankBranch",l:"סניף",branchCombo:true,half:true,ph:"מספר או שם הסניף",
    v:function(){
      if(!s.bankCode) return "נא לבחור בנק תחילה";
      if(!String(s.bankBranch||"").trim()) return "נא לבחור סניף";
      if(!branchExists(s.bankCode, s.bankBranch)) return "לא נמצא סניף כזה בבנק שנבחר — בחרי מהרשימה";
      return "";
    }},
   {k:"bankAccount",l:"מספר חשבון",account:true,max:9,half:true,ph:"ספרות בלבד",
    v:function(x){
      var d = String(x||"");
      if(!d) return "נא להזין מספר חשבון";
      if(!/^\d+$/.test(d)) return "מספר החשבון מכיל ספרות בלבד";
      if(d.length > 9) return "מספר חשבון ארוך מדי";
      return "";
    }}
 ],
 after:wireBankHelp},

{sec:"פרטי חשבון בנק", q:function(){return SEED.firstName+", "+G("אשר לנו שאלו הפרטים הנכונים","אשרי לנו שאלו הפרטים הנכונים")+" ✅"}, sub:"",
 when:function(){return !!(s.bankCode && s.bankBranch && s.bankAccount)},
 bankSummary:true},

{sec:"פרטים אישיים", q:function(){return "מהי תעודת הזהות שלך? 😊"}, sub:"כולל ספרת ביקורת",
 fields:[{k:"idNum",l:"מספר תעודת זהות",type:"text",mode:"numeric",max:9,ph:"000000000",
          v:function(x){return validIsraeliId(x)?"":"מספר תעודת זהות לא תקין — נסי לבדוק שוב"}}]},

{sec:"פרטים אישיים", q:function(){return "מתי נולדת? 🎂"}, sub:"",
 fields:[{k:"birthDate",l:"",type:"date",ph:"06/03/1989",v:function(x){
    if(!x) return "נא להקליד תאריך מלא בפורמט יום/חודש/שנה";
    var a = TAX_YEAR - Number(x.split("-")[0]);
    if(a<16) return "גיל מתחת ל-16 — נא לבדוק את התאריך";
    if(a>100) return "התאריך נראה שגוי";
    return "";
  }}]},

{sec:"פרטים אישיים", q:function(){return "האם נולדת בישראל?"}, sub:"",
 choice:{k:"bornIsrael", opts:[{v:"yes",l:"כן"},{v:"no",l:"לא, עליתי ארצה"}]}},

{sec:"פרטים אישיים", q:function(){return "מתי עלית ארצה?"}, sub:"",
 when:function(){return s.bornIsrael==="no"},
 fields:[{k:"aliyaDate",l:"תאריך עלייה",type:"date",ph:"14/09/2010",v:req}]},

{sec:"סטטוס", q:function(){return G("האם אתה תושב ישראל?","האם את תושבת ישראל?")}, sub:"",
 choice:{k:"resident", opts:[{v:"yes",l:"כן"},{v:"no",l:"לא"}]}},

{sec:"פרטים אישיים", q:function(){return G("היכן אתה גר?","היכן את גרה?")}, sub:"",
 fields:[{k:"city",l:"יישוב",combo:"city",v:req,ph:"הקלדה לחיפוש…",hint:"מתוך רשימת היישובים הרשמית"},
         {k:"street",l:"רחוב",combo:"street",v:req,grow:true,ph:"הקלדה לחיפוש…"},
         {k:"houseNo",l:"מספר",type:"text",mode:"numeric",v:req,narrow:true},
         {k:"zip",l:"מיקוד",type:"text",mode:"numeric",max:7,ph:"7 ספרות",
          hint:"נמלא אותו עבורך — אפשר לתקן",
          v:function(x){ return isDigits(x,7) ? "" : "מיקוד הוא 7 ספרות"; }}],
 after:wireZipLookup},

{sec:"סטטוס", q:function(){return G("האם אתה חבר בקיבוץ או במושב שיתופי?","האם את חברה בקיבוץ או במושב שיתופי?")}, sub:"",
 choice:{k:"kibbutz", opts:[
   {v:"no",l:"לא"},
   {v:"transferred",l:"כן, הכנסותיי ממעסיק זה מועברות לקיבוץ"},
   {v:"not_transferred",l:"כן, הכנסותיי ממעסיק זה אינן מועברות לקיבוץ"}]}},

{sec:"סטטוס", q:function(){return G("באיזו קופת חולים אתה רשום?","באיזו קופת חולים את רשומה?")}, sub:"",
 choice:{k:"hmo", opts:HMOS.map(function(h){return {v:h,l:h}}).concat([{v:"none",l:G("לא רשום בקופה","לא רשומה בקופה")}])}},

/* ---------- section: family ---------- */
{sec:"מצב משפחתי", q:function(){return "מהו המצב המשפחתי שלך?"}, sub:"",
 choice:{k:"marital", opts:[
   {v:"single",l:G("רווק","רווקה")},
   {v:"married",l:G("נשוי","נשואה")},
   {v:"divorced",l:G("גרוש","גרושה")},
   {v:"widowed",l:G("אלמן","אלמנה")},
   {v:"separated",l:G("פרוד","פרודה"),note:"נדרש אישור פקיד שומה"}]}},

{sec:"מצב משפחתי", q:function(){return "שים לב"}, sub:"",
 when:function(){return s.marital==="separated"},
 notice:{kind:"info", html:function(){
   return "לטופס 101 של "+G("פרוד","פרודה")+" יש לצרף <b>אישור פקיד שומה</b>. אי אפשר להעלות אותו כאן — יש להביא אותו בנפרד למשרד."; }}},

{sec:"מצב משפחתי", q:function(){return "פרטי בן/בת הזוג"}, sub:"",
 when:function(){return s.marital==="married"},
 fields:[{k:"spouseId",l:"מספר תעודת זהות",type:"text",mode:"numeric",max:9,
          v:function(x){return validIsraeliId(x)?"":"מספר תעודת זהות לא תקין"}},
         {k:"spouseFirst",l:"שם פרטי",type:"text",half:true,v:req},
         {k:"spouseLast",l:"שם משפחה",type:"text",half:true,v:req},
         {k:"spouseBirth",l:"תאריך לידה",type:"date",half:true,v:req},
         {k:"spouseAliya",l:"תאריך עלייה (אם רלוונטי)",type:"date",half:true}]},

{sec:"מצב משפחתי", q:function(){return "האם לבן/בת הזוג יש הכנסה?"}, sub:"",
 when:function(){return s.marital==="married"},
 choice:{k:"spouseIncome", opts:[
   {v:"none",l:"אין לבן/בת הזוג כל הכנסה"},
   {v:"work",l:"יש הכנסה מעבודה"},
   {v:"pension",l:"יש הכנסה מקצבה או מעסק"},
   {v:"other",l:"יש הכנסה אחרת"}]}},

{sec:"מצב משפחתי", q:function(){return G("אתה הורה במשפחה חד הורית?","את הורה במשפחה חד הורית?")}, sub:"",
 when:function(){return s.marital==="divorced"},
 choice:{k:"singleParentDiv", opts:[{v:"yes",l:"כן"},{v:"no",l:"לא"}]}},

{sec:"מצב משפחתי", q:function(){return "האם משולמים מזונות?"}, sub:"",
 when:function(){return s.marital==="divorced"},
 choice:{k:"alimonyDiv", opts:[
   {v:"pay",l:G("אני משלם מזונות","אני משלמת מזונות")},
   {v:"receive",l:G("אני מקבל מזונות","אני מקבלת מזונות")},
   {v:"none",l:"לא משולמים מזונות"}]}},

/* ---------- section: children ---------- */
{sec:"ילדים", q:function(){return "יש לך ילדים שטרם מלאו להם 19?"}, sub:"",
 choice:{k:"hasKids", opts:[{v:"yes",l:"כן"},{v:"no",l:"לא"}]}},

{sec:"ילדים", q:function(){return "פרטי הילדים"}, sub:"אפשר להוסיף כמה שצריך",
 when:function(){return s.hasKids==="yes"}, kids:true},

/* ---------- section: income here ---------- */
{sec:"ההכנסה שלך אצלנו", q:function(){return G("איזה תשלום אתה מקבל מאיתנו?","איזה תשלום את מקבלת מאיתנו?")}, sub:"בחירה אחת",
 choice:{k:"payType", opts:PAY_TYPES.map(function(p){return {v:p,l:p}})}},

/* ---------- section: other income ---------- */
{sec:"הכנסות אחרות", q:function(){return "האם יש לך הכנסות נוספות?"}, sub:"משכורת ממקום אחר, עסק, קצבה, מלגה וכדומה",
 choice:{k:"otherIncome", opts:[
   {v:"no",l:"אין לי הכנסות אחרות",note:"לא ממשכורת, לא מעסק, לא מקצבה ולא ממלגה"},
   {v:"yes",l:"יש לי הכנסות אחרות"}]}},

{sec:"הכנסות אחרות", q:function(){return "מאיזה סוג?"}, sub:"אפשר לבחור יותר מאחד",
 when:function(){return s.otherIncome==="yes"},
 multi:{k:"otherKinds", opts:PAY_TYPES.map(function(p){return {v:p,l:p}})}},

{sec:"הכנסות אחרות", q:function(){return "מה לעשות עם נקודות הזיכוי שלך?"}, sub:"",
 when:function(){return s.otherIncome==="yes"},
 choice:{k:"creditChoice", opts:[
   {v:"here",l:G("אבקש לקבל נקודות זיכוי ומדרגות מס כנגד הכנסתי זו. איני מקבל אותן בהכנסה אחרת.","אבקש לקבל נקודות זיכוי ומדרגות מס כנגד הכנסתי זו. איני מקבלת אותן בהכנסה אחרת.")},
   {v:"other",l:G("אני מקבל נקודות זיכוי ומדרגות מס בהכנסה אחרת ועל כן איני זכאי להן כנגד הכנסה זו.","אני מקבלת נקודות זיכוי ומדרגות מס בהכנסה אחרת ועל כן איני זכאית להן כנגד הכנסה זו.")}]}},

{sec:"הכנסות אחרות", q:function(){return "הצהרות נוספות"}, sub:"סמני את המשפטים הנכונים לגבייך",
 when:function(){return s.otherIncome==="yes"},
 flags:[{k:"decl9",l:"אין מפרישים עבורי לקרן השתלמות בגין הכנסתי האחרת, או שכל הפרשות המעסיק לקרן השתלמות בגין הכנסתי האחרת מצורפות להכנסתי האחרת."},
        {k:"decl10",l:"אין מפרישים עבורי לקצבה / לביטוח אובדן כושר עבודה / פיצויים בגין הכנסתי האחרת, או שכל הפרשות המעסיק לקצבה / לביטוח אובדן כושר עבודה / פיצויים בגין הכנסתי האחרת מצורפות להכנסתי האחרת."}]},

/* ---------- section: tax coordination (מיד אחרי ההכנסות הנוספות) ---------- */
{sec:"תיאום מס", q:function(){return "האם יש לך תיאום מס?"}, sub:"",
 when:function(){return s.otherIncome==="yes"},
 choice:{k:"taxCoord", opts:[{v:"yes",l:"כן, יש לי"},{v:"no",l:"אין לי תיאום מס"}]}},

{sec:"תיאום מס", q:function(){return G("שים לב","שימי לב")+" ⚠️"}, sub:"",
 when:function(){return s.otherIncome==="yes" && s.taxCoord==="no"},
 notice:{kind:"warn", html:function(){
   return "מכיוון שיש לך הכנסה נוספת ואין אישור תיאום מס, "+
     "<b>אם לא יסופק אישור תיאום מס עד המשכורת הקרובה — יירדו 47% מס מהמשכורת</b>."+
     '<br><br>מומלץ להסדיר תיאום מס בהקדם ולשלוח אותו לכתובת: ' +
     '<span class="mail-wrap"><a class="mailto" href="mailto:'+HR_MAIL+'">'+HR_MAIL+'</a>' +
     '<button type="button" class="mail-copy" data-copy="'+HR_MAIL+'" aria-label="העתקת כתובת המייל" title="העתקת המייל">📋</button></span>'; }}},

{sec:"תיאום מס", q:function(){return "מהן הסיבות לבקשת תיאום מס?"}, sub:"",
 when:function(){return s.otherIncome==="yes" && s.taxCoord==="yes"},
 choice:{k:"taxReason", opts:[
   {v:"noIncome",l:"לא הייתה לי הכנסה מתחילת שנת המס הנוכחית עד לתחילת עבודתי אצל מעסיק זה."},
   {v:"multi",l:"יש לי הכנסות נוספות ממשכורת כמפורט להלן."},
   {v:"approved",l:"פקיד השומה אישר תיאום לפי אישור מצורף."}]}},

{sec:"תיאום מס", q:function(){return "פירוט ההכנסות הנוספות"}, sub:"בנוסף להכנסה ממעסיק זה · עד 3 מעסיקים",
 when:function(){return s.otherIncome==="yes" && s.taxCoord==="yes" && s.taxReason==="multi"}, employers:true},

{sec:"תיאום מס", q:function(){return "העלאת אישור תיאום המס"}, sub:"צילום או קובץ PDF של האישור מפקיד השומה",
 when:function(){return s.otherIncome==="yes" && s.taxCoord==="yes"},
 upload:{k:"coordFile", l:"צירוף אישור תיאום מס", optional:true}},

/* ---------- section: part 8 ---------- */
{sec:"פטור וזיכוי ממס", q:function(){return G("אני מבקש פטור או זיכוי ממס מהסיבות הבאות:","אני מבקשת פטור או זיכוי ממס מהסיבות הבאות:")},
 sub:"סמני כל סעיף שנכון לגבייך.", part8:true},

/* ---------- section: signature ---------- */
{sec:"הצהרה וחתימה", q:function(){return SEED.firstName+", כמעט סיימנו!"}, sub:"נא לקרוא ולחתום", sign:true},

/* ==========================================================
   section: פנסיה — נפרד מטופס 101, מוצג רק לפי גיל וחוק
   זכר מגיל 21 / נקבה מגיל 20. הנתונים נשמרים בנפרד.
   ========================================================== */
// שאלת קופה פעילה — הקוביה (על פי המידע שמסרת...) מוצגת inline באותו עמוד, בלי אישור
{sec:"פנסיה", q:function(){return "האם קיימת לך קופה פנסיונית פעילה שבוצעה אליה הפקדה במהלך 6 החודשים האחרונים?"},
 sub:"קופה פעילה היא קופה שבוצעה אליה לפחות הפקדה אחת במהלך ששת החודשים האחרונים.",
 when:function(){return pensionOn()},
 penActive:true},

// המשך הפקדה לקופה הקיימת? (רק אם קיימת קופה פעילה) — בלי אישור
{sec:"פנסיה", q:function(){return "האם ברצונך להמשיך להפקיד לקופה הפנסיונית הקיימת שלך?"}, sub:"",
 when:function(){return pensionOn() && s.penActive==="yes"},
 choice:{k:"penContinue", opts:[{v:"yes",l:"כן"},{v:"no",l:"לא"}]}},

// המשך=כן — העלאת מסמכים
{sec:"פנסיה", q:function(){return "העלאת מסמכים"}, sub:"",
 when:function(){return pensionOn() && s.penActive==="yes" && s.penContinue==="yes"},
 penDocs:true}
];

function req(x){ return String(x||"").trim() ? "" : "נא למלא שדה זה"; }

/* ---------- השלמת מיקוד ---------- */
function zipLookupLink(){
  return '<a class="hint-link" href="https://israelpost.co.il/zipcodesearch" target="_blank" rel="noopener noreferrer">' +
         'לאיתור המיקוד באתר דואר ישראל »</a>';
}
function wireZipLookup(wrap){
  var zipField = wrap.querySelector('[data-key="zip"]');
  if(!zipField) return;
  var zipInput = zipField.querySelector("input");
  var hint = zipField.querySelector(".hint");
  var baseHint = hint ? hint.textContent : "";
  var timer = null;
  var lastTried = "";
  var manual = false;

  // "ידני" נכון רק כל עוד יש ערך. שדה שרוקן חוזר להשלמה אוטומטית.
  zipInput.addEventListener("input", function(){
    manual = zipInput.value.trim() !== "";
    if(hint) hint.textContent = baseHint;
  });

  function tryLookup(){
    if(manual && s.zip) return;
    var key = s.city + "|" + s.street + "|" + s.houseNo;
    if(!s.city || !s.street || !s.houseNo || key === lastTried) return;
    lastTried = key;
    if(hint) hint.textContent = "מחפשים את המיקוד…";
    // 1) התאמת בית מדויקת מהמאגר הרשמי · 2) גוגל · 3) הערכת שכן קרוב (מסומן "לוודא")
    localZip(s.city, s.street, s.houseNo).then(function(z){
      if(z) return {zip:z, approx:false};
      return lookupZip(s.city, s.street, s.houseNo).then(function(g){
        if(g) return {zip:g, approx:false};
        return localZipApprox(s.city, s.street, s.houseNo).then(function(a){
          return {zip:a, approx:!!a};
        });
      });
    }).then(function(res){
      if(!hint) return;
      hint.classList.remove("approx");
      if(res.zip && !manual){
        s.zip = res.zip;
        zipInput.value = res.zip;
        zipField.classList.remove("bad");
        if(res.approx){
          // מיקוד משוער (שכן קרוב) — ממלאים אבל מבקשים לוודא, עם קישור לאיתור
          hint.classList.add("approx");
          hint.innerHTML = 'השלמה משוערת — נא לוודא את המיקוד ' + zipLookupLink();
        } else {
          hint.textContent = "מולא אוטומטית — אפשר לתקן";
        }
        save();
      } else if(!res.zip){
        hint.innerHTML = 'לא הצלחנו למצוא — נא למלא ידנית ' + zipLookupLink();
      } else {
        // נמצא מיקוד אך העובד כבר הקליד אחד — לא דורסים, ומחזירים את ההסבר
        hint.textContent = baseHint;
      }
    });
  }

  ["city","street","houseNo"].forEach(function(k){
    var f = wrap.querySelector('[data-key="'+k+'"]');
    if(!f) return;
    f.addEventListener("input", function(){
      clearTimeout(timer);
      timer = setTimeout(tryLookup, 700);
    });
  });

  if(s.city && s.street && s.houseNo && !s.zip) setTimeout(tryLookup, 250);
}

/* ---------- קישור עזרה: אישור ניהול חשבון ----------
   בדיקת ה-checksum היא כלי פנימי בלבד ואינה מוצגת לעובד בשום צורה. */
/* ---------- מסך סיכום פרטי חשבון בנק + הצהרה ---------- */
function buildBankSummary(host){
  var bank = bankByCode(s.bankCode);
  var rows = el("div","bank-sum");
  function row(label, value){
    var r = el("div","bank-sum-row");
    r.appendChild(el("span",null,label));
    r.appendChild(el("b",null,value||"—"));
    rows.appendChild(r);
  }
  row("בנק", bank ? bank.name : s.bankCode);
  row("סניף", branchLabel(s.bankCode, s.bankBranch));
  row("שם בעל החשבון", s.bankHolder);
  row("מספר חשבון", String(s.bankAccount||""));
  host.appendChild(rows);

  var dwrap = el("div","field");
  dwrap.dataset.key = "bankConfirm";
  var db = el("button","choice sq bank-decl"); db.type = "button";
  db.setAttribute("role","checkbox"); db.setAttribute("aria-checked", s.bankConfirm?"true":"false");
  db.appendChild(el("span","dot"));
  db.appendChild(el("span","txt",
    "אני "+G("מצהיר","מצהירה")+" כי בדקתי את פרטי הבנק, הסניף ומספר החשבון שהזנתי, וכי אלה הפרטים שאליהם אבקש להעביר את משכורתי. ידוע לי כי האחריות לנכונות הפרטים שהוזנו חלה עליי."));
  db.onclick = function(){
    s.bankConfirm = !s.bankConfirm;
    db.setAttribute("aria-checked", s.bankConfirm?"true":"false");
    dwrap.classList.remove("bad"); save();
  };
  dwrap.appendChild(db);
  dwrap.appendChild(el("div","err",""));
  host.appendChild(dwrap);
}

function wireBankHelp(wrap){
  var card = el("button","bank-help-card"); card.type = "button";
  card.innerHTML =
    '<span class="bank-help-ic">📄</span>'+
    '<span class="bank-help-txt">'+G("לא בטוח","לא בטוחה")+' בפרטי החשבון? עדיף להוציא <b>אישור ניהול חשבון</b>'+
    ' — <span class="bank-help-cta">'+G("למדריך לחץ כאן","למדריך לחצי כאן")+' »</span></span>';
  card.onclick = openAccountCertHelp;
  var body = wrap.querySelector(".fields");
  if(body) wrap.insertBefore(card, body); else wrap.appendChild(card);
}
function openAccountCertHelp(){
  var ov = el("div","modal-overlay");
  var box = el("div","modal-box");
  box.appendChild(el("h2",null,"איך מפיקים אישור ניהול חשבון?"));
  var ol = el("ol");
  [ "היכנס/י לאפליקציה או לאתר של הבנק.",
    "היכנס/י לאזור מסמכים, אישורים, דוחות או סיכומים.",
    "בחר/י אישור ניהול חשבון או אישור בעלות בחשבון.",
    "הורד/י את המסמך." ].forEach(function(t){ ol.appendChild(el("li",null,t)); });
  box.appendChild(ol);
  var tip = el("p","tip");
  tip.innerHTML = "💡 <b>טיפ:</b> ברוב אפליקציות הבנקים אפשר לחפש את הביטוי \"אישור ניהול חשבון\" בשורת החיפוש.";
  box.appendChild(tip);
  var close = el("button","btn btn-primary","הבנתי"); close.type = "button";
  close.onclick = function(){ ov.remove(); };
  box.appendChild(close);
  ov.appendChild(box);
  ov.addEventListener("click", function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

/* =========================================================
   navigation
   ========================================================= */
function visible(){ return steps.filter(function(st){ return !st.when || st.when(); }); }
function current(){ var v=visible(); if(stepIdx>=v.length) stepIdx=v.length-1; if(stepIdx<0)stepIdx=0; return v[stepIdx]; }

var screen = "welcome"; // welcome | form | done

function go(delta){
  var st = current();
  if(delta>0 && !collect(st)) return;
  stepIdx += delta;
  var v = visible();
  if(stepIdx >= v.length){
    screen="done"; stepIdx=v.length-1;
    if(remote && remote.submit && !submitted){
      submitted = true;
      remote.submit(formAnswers()).catch(function(e){ console.warn("submit failed", e); submitted = false; });
      if(remote.pensionSubmit && pensionOn()){
        remote.pensionSubmit(pensionAnswers()).catch(function(e){ console.warn("pension submit failed", e); });
      }
    }
  }
  if(stepIdx<0) stepIdx=0;
  save(); render();
  scrollTop();
}

/* =========================================================
   render
   ========================================================= */
var main = document.getElementById("main");
var topbar = document.getElementById("topbar");

function render(){
  main.innerHTML = "";
  if(screen==="welcome"){ topbar.classList.add("hidden"); renderWelcome(); return; }
  if(screen==="done"){ topbar.classList.add("hidden"); renderDone(); return; }
  topbar.classList.remove("hidden");
  renderStep();
}

function renderWelcome(){
  var w = el("section","welcome step-anim");
  var img = el("img","logo"); img.src = LOGO; img.alt = "שאול תמרוקים"; w.appendChild(img);
  var h = el("h1","hello");
  h.appendChild(document.createTextNode("שלום "));
  h.appendChild(el("em",null,SEED.firstName));
  h.appendChild(document.createTextNode(" 👋"));
  w.appendChild(h);
  w.appendChild(el("p","lede", G("ברוך הבא לשאול תמרוקים, מצפה לנו דרך נפלאה :)","ברוכה הבאה לשאול תמרוקים, מצפה לנו דרך נפלאה :)")));
  w.appendChild(el("p",null, G("כמה פרטים קטנים ואתה בפנים!","כמה פרטים קטנים ואת בפנים!")));
  w.appendChild(el("p","ask", G("מוכן להתחיל?","מוכנה להתחיל?")));

  var nav = el("div","nav");
  var b = el("button","btn btn-primary", stepIdx>0 ? "המשך מהמקום שעצרת" : "מתחילים!");
  b.onclick = function(){ screen="form"; save(); render(); };
  nav.appendChild(b);
  w.appendChild(nav);

  if(stepIdx>0){
    var reset = el("button","btn btn-ghost","להתחיל מחדש");
    reset.type="button"; reset.style.width="100%";
    var armed = false;
    reset.onclick = function(){
      if(!armed){
        armed = true;
        reset.textContent = "בטוח? כל התשובות יימחקו — לחיצה נוספת";
        reset.style.color = "var(--danger)";
        setTimeout(function(){ if(armed){ armed=false; reset.textContent="להתחיל מחדש"; reset.style.color=""; } }, 4000);
        return;
      }
      resetAll();
    };
    w.appendChild(reset);
  }
  main.appendChild(w);
}

function renderStep(){
  var st = current(), v = visible();
  document.getElementById("secLabel").textContent = st.sec;
  document.getElementById("counter").textContent = (stepIdx+1) + " / " + v.length;
  document.getElementById("bar").style.width = ((stepIdx)/(v.length-1)*100) + "%";

  var wrap = el("section","step-anim");
  // תווית הסעיף מופיעה כבר בפס העליון, לכן אין צורך בכותרת נוספת מעל השאלה
  wrap.appendChild(el("h1","q", st.q()));
  wrap.appendChild(el("p","sub", st.sub||""));

  var body = el("div","fields");
  wrap.appendChild(body);

  if(st.fields)    buildFields(body, st.fields);
  if(st.choice)    buildChoice(body, st.choice);
  if(st.multi)     buildMulti(body, st.multi);
  if(st.flags)     buildFlags(body, st.flags);
  if(st.notice)    buildNotice(body, st.notice);
  if(st.kids)      buildKids(body);
  if(st.employers) buildEmployers(body);
  if(st.upload)    buildUpload(body, st.upload);
  if(st.part8)     buildPart8(body);
  if(st.bankSummary) buildBankSummary(body);
  if(st.penActive) buildPenActive(body);
  if(st.penDocs)   buildPenDocs(body);
  if(st.sign)      buildSign(body);

  var bt = document.getElementById("backTop");
  bt.classList.toggle("show", stepIdx>0);
  bt.onclick = function(){ go(-1); };

  stepErrBox = el("div","step-error");
  wrap.appendChild(stepErrBox);

  var nav = el("div","nav");
  if(stepIdx>0){
    var back = el("button","btn btn-back","חזרה");
    back.type="button";
    back.onclick = function(){ go(-1); };
    nav.appendChild(back);
  }
  var next = el("button","btn btn-primary", st.sign ? "סיום ושליחה" : "המשך");
  next.onclick = function(){ go(1); };
  nav.appendChild(next);
  wrap.appendChild(nav);

  main.appendChild(wrap);

  if(st.after) st.after(wrap);

  var first = wrap.querySelector("input,select,textarea");
  if(first && window.matchMedia && window.matchMedia("(min-width:640px)").matches) first.focus();
}

/* ---------- builders ---------- */
function mkField(f){
  var wrapCls = "field";
  var d = el("div",wrapCls);
  d.dataset.key = f.k;
  if(f.l){
    var lab = el("label",null,f.l);
    lab.htmlFor = "f_"+f.k;
    d.appendChild(lab);
  }

  if(f.type==="gender"){
    var seg = el("div","seg");
    (f.opts || [{v:"f",l:"נקבה"},{v:"m",l:"זכר"}]).forEach(function(o){
      var b = el("button","seg-btn"+(s[f.k]===o.v?" on":""), o.l);
      b.type="button";
      b.onclick = function(){
        s[f.k]=o.v; save();
        seg.querySelectorAll(".seg-btn").forEach(function(x){x.classList.remove("on")});
        b.classList.add("on");
      };
      seg.appendChild(b);
    });
    d.appendChild(seg);
    return d;
  }

  var i = document.createElement("input");
  i.id = "f_"+f.k;
  if(f.type==="date"){
    i.value = isoToDmy(s[f.k]);
    maskDate(i, function(iso){ s[f.k]=iso; d.classList.remove("bad"); save(); }, f.ph);
    d.appendChild(i);
    d.appendChild(el("div","err",""));
    return d;
  }
  if(f.bank){
    i.type = "text";
    i.autocomplete = "off";
    i.value = bankLabel(s[f.k]);
    i.placeholder = f.ph || "הקלדה לחיפוש בנק…";
    d.appendChild(makeCombo(i,
      function(){ return BANKS.map(function(b){ return b.code+" "+b.name; }); },
      function(v){
        var found = bankFromLabel(v);
        var newCode = found ? found.code : "";
        if(newCode !== s[f.k]){
          // החלפת בנק — מאפסים את הסניף כדי שלא יישאר סניף מבנק אחר
          s.bankBranch = "";
          var bi = document.getElementById("f_bankBranch");
          if(bi) bi.value = "";
        }
        s[f.k] = newCode;
        d.classList.remove("bad");
        save();
      }));
    if(f.hint) d.appendChild(el("div","hint",f.hint));
    d.appendChild(el("div","err",""));
    return d;
  }
  if(f.branchCombo){
    i.type = "text";
    i.autocomplete = "off";
    i.value = s.bankBranch ? branchLabel(s.bankCode, s.bankBranch) : "";
    i.placeholder = f.ph || "מספר או שם הסניף";
    d.appendChild(makeCombo(i,
      function(){ return branchDisplays(s.bankCode); },
      function(v){
        var m = String(v).match(/(\d+)/);
        s.bankBranch = m ? m[1] : "";
        d.classList.remove("bad");
        save();
      }));
    if(f.hint) d.appendChild(el("div","hint",f.hint));
    d.appendChild(el("div","err",""));
    return d;
  }
  if(f.account){
    // מספר חשבון: ספרות בלבד, ללא הדבקה וללא גרירה. נשמר כמחרוזת, אפסים מובילים נשמרים.
    i.type = "text";
    i.classList.add("bank-num");
    i.inputMode = "numeric";
    i.autocomplete = "off";
    i.setAttribute("autocorrect","off");
    i.setAttribute("spellcheck","false");
    if(f.max) i.maxLength = f.max;
    if(f.ph) i.placeholder = f.ph;
    i.value = esc(s[f.k]);
    i.addEventListener("beforeinput", function(e){
      if(e.data != null && /\D/.test(e.data)) e.preventDefault();
    });
    i.addEventListener("input", function(){
      var clean = i.value.replace(/\D/g,"").slice(0, f.max||9);
      if(i.value !== clean) i.value = clean;
      s[f.k] = i.value;
      d.classList.remove("bad"); save();
    });
    i.addEventListener("paste", function(e){ e.preventDefault(); });
    i.addEventListener("drop", function(e){ e.preventDefault(); });
    i.addEventListener("dragover", function(e){ e.preventDefault(); });
    i.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); go(1); } });
    d.appendChild(i);
    if(f.hint) d.appendChild(el("div","hint",f.hint));
    d.appendChild(el("div","err",""));
    return d;
  }
  if(f.combo){
    i.type = "text";
    i.value = esc(s[f.k]);
    i.placeholder = f.ph || "";
    var getList = f.combo === "city"
      ? function(){ return addrData().cities; }
      : function(){ return streetsOf(s.city); };
    d.appendChild(makeCombo(i, getList, function(v){
      s[f.k] = v;
      if(f.combo === "city"){
        s.street = "";
        var si = document.getElementById("f_street");
        if(si) si.value = "";
      }
      d.classList.remove("bad");
      save();
    }));
    d.appendChild(el("div","hint", f.hint||""));
    d.appendChild(el("div","err",""));
    return d;
  }
  i.type = f.type||"text";
  if(f.prefill && !String(s[f.k]||"").trim()){ s[f.k] = f.prefill(); }
  i.value = esc(s[f.k]);
  if(f.mode) i.inputMode = f.mode;
  if(f.max) i.maxLength = f.max;
  if(f.ph) i.placeholder = f.ph;
  if(f.mode==="numeric") i.addEventListener("input",function(){ i.value = i.value.replace(/\D/g,""); });
  i.addEventListener("input",function(){ s[f.k]=i.value; d.classList.remove("bad"); save(); });
  i.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); go(1); } });
  d.appendChild(i);
  if(f.hint) d.appendChild(el("div","hint",f.hint));
  d.appendChild(el("div","err",""));
  return d;
}
function buildFields(host, fields){
  var i=0;
  while(i<fields.length){
    var f = fields[i];
    if(f.grow && fields[i+1] && fields[i+1].narrow){
      var r = el("div","row-addr");
      r.appendChild(mkField(f)); r.appendChild(mkField(fields[i+1]));
      host.appendChild(r); i+=2; continue;
    }
    if(f.half && fields[i+1] && fields[i+1].half){
      var r2 = el("div","row2");
      r2.appendChild(mkField(f)); r2.appendChild(mkField(fields[i+1]));
      host.appendChild(r2); i+=2; continue;
    }
    host.appendChild(mkField(f)); i++;
  }
}

function buildChoice(host, c){
  var box = el("div","choices");
  c.opts.forEach(function(o){
    var b = el("button","choice");
    b.type="button"; b.setAttribute("role","radio");
    b.setAttribute("aria-checked", s[c.k]===o.v ? "true":"false");
    b.appendChild(el("span","dot"));
    var t = el("span","txt"); t.appendChild(document.createTextNode(o.l));
    if(o.note) t.appendChild(el("small",null,o.note));
    b.appendChild(t);
    b.onclick = function(){
      s[c.k]=o.v; save();
      if(c.k==="gender"){ render(); return; }
      box.querySelectorAll(".choice").forEach(function(x){x.setAttribute("aria-checked","false")});
      b.setAttribute("aria-checked","true");
      setTimeout(function(){ go(1); }, 190);
    };
    box.appendChild(b);
  });
  host.appendChild(box);
  host.appendChild(el("div","err",""));
}

function buildMulti(host, m){
  var box = el("div","choices");
  m.opts.forEach(function(o){
    var on = s[m.k].indexOf(o.v)>-1;
    var b = el("button","choice sq"); b.type="button";
    b.setAttribute("role","checkbox"); b.setAttribute("aria-checked", on?"true":"false");
    b.appendChild(el("span","dot"));
    b.appendChild(el("span","txt",o.l));
    b.onclick = function(){
      var idx = s[m.k].indexOf(o.v);
      if(idx>-1) s[m.k].splice(idx,1); else s[m.k].push(o.v);
      b.setAttribute("aria-checked", s[m.k].indexOf(o.v)>-1 ? "true":"false");
      save();
    };
    box.appendChild(b);
  });
  host.appendChild(box);
  host.appendChild(el("div","err",""));
}

function buildFlags(host, flags){
  var box = el("div","choices");
  flags.forEach(function(f){
    var b = el("button","choice sq"); b.type="button";
    b.setAttribute("role","checkbox"); b.setAttribute("aria-checked", s[f.k]?"true":"false");
    b.appendChild(el("span","dot"));
    b.appendChild(el("span","txt",f.l));
    b.onclick = function(){ s[f.k]=!s[f.k]; b.setAttribute("aria-checked", s[f.k]?"true":"false"); save(); };
    box.appendChild(b);
  });
  host.appendChild(box);
}

function buildNotice(host, n){
  var d = el("div","notice "+(n.kind||"info"));
  d.innerHTML = n.html();
  wireMailCopy(d);
  host.appendChild(d);
}
function wireMailCopy(root){
  root.querySelectorAll(".mail-copy").forEach(function(btn){
    btn.onclick = function(){
      var val = btn.getAttribute("data-copy");
      var done = function(){ btn.classList.add("copied"); btn.textContent="הועתק ✓";
        setTimeout(function(){ btn.classList.remove("copied"); btn.textContent="📋"; }, 1600); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(val).then(done).catch(function(){ fallbackCopy(val); done(); });
      } else { fallbackCopy(val); done(); }
    };
  });
}
function fallbackCopy(val){
  try{
    var t=document.createElement("textarea"); t.value=val;
    t.style.position="fixed"; t.style.opacity="0"; document.body.appendChild(t);
    t.focus(); t.select(); document.execCommand("copy"); t.remove();
  }catch(e){}
}

function buildUpload(host, u){
  var d = el("div","field");
  d.dataset.key = u.k;
  d.appendChild(el("label",null,u.l));
  var wrap = el("div","file");
  var inp = document.createElement("input"); inp.type="file"; inp.accept="image/*,application/pdf"; inp.id="up_"+u.k;
  var btn = el("button","btn btn-soft btn-sm","בחירת קובץ"); btn.type="button";
  var nameEl = el("span","file-name", s[u.k] ? "✓ "+s[u.k] : "");
  btn.onclick = function(){ inp.click(); };
  inp.onchange = function(){ if(inp.files[0]){ s[u.k]=inp.files[0].name; nameEl.textContent="✓ "+s[u.k]; save(); } };
  wrap.appendChild(btn); wrap.appendChild(inp); wrap.appendChild(nameEl);
  d.appendChild(wrap);
  if(!u.noHint) d.appendChild(el("div","hint","צילום מהטלפון או קובץ PDF"));
  d.appendChild(el("div","err",""));
  host.appendChild(d);
}

/* ---------- שאלת קופה פעילה + קוביה inline ---------- */
function buildPenActive(host){
  // צביעת "פעילה" בכותרת ובהסבר (ה-wrap עדיין לא ב-main בשלב זה, לכן דרך host.parentNode)
  if(host.parentNode){
    var q = host.parentNode.querySelector("h1.q");
    if(q) q.innerHTML = 'האם קיימת לך קופה פנסיונית <span class="hl">פעילה</span> שבוצעה אליה הפקדה במהלך 6 החודשים האחרונים?';
    var sub = host.parentNode.querySelector(".sub");
    if(sub) sub.innerHTML = 'קופה <span class="hl">פעילה</span> היא קופה שבוצעה אליה לפחות הפקדה אחת במהלך ששת החודשים האחרונים.';
  }

  var box = el("div","choices");
  var note = el("div","notice info pen-note");
  function updateNote(){
    if(s.penActive==="yes"){
      note.innerHTML = 'בהתאם לחוק, ההפרשות הפנסיוניות יבוצעו לאחר <span class="hl">3 חודשי עבודה</span>, באופן רטרואקטיבי החל מיום תחילת עבודתך.';
      note.style.display = "";
    } else if(s.penActive==="no"){
      note.innerHTML = "על פי המידע שמסרת, אין ברשותך קופה פנסיונית פעילה (לא בוצעה אליה הפקדה במהלך 6 החודשים האחרונים)." +
        '<br><br>בהתאם לחוק, ההפרשות הפנסיוניות יחלו לאחר <span class="hl">6 חודשי עבודה</span>.';
      note.style.display = "";
    } else {
      note.style.display = "none";
    }
  }
  [{v:"yes",l:"כן"},{v:"no",l:"לא"}].forEach(function(o){
    var b = el("button","choice"); b.type="button"; b.setAttribute("role","radio");
    b.setAttribute("aria-checked", s.penActive===o.v ? "true":"false");
    b.appendChild(el("span","dot")); b.appendChild(el("span","txt",o.l));
    b.onclick = function(){
      s.penActive = o.v; save();
      box.querySelectorAll(".choice").forEach(function(x){ x.setAttribute("aria-checked","false"); });
      b.setAttribute("aria-checked","true");
      updateNote();
    };
    box.appendChild(b);
  });
  host.appendChild(box);
  host.appendChild(note);
  updateNote();
  host.appendChild(el("div","err",""));
}

/* ---------- מסך העלאת מסמכי פנסיה ---------- */
function buildPenDocs(host){
  var intro = el("div","notice info");
  intro.innerHTML =
    'כדי שנוכל להמשיך להפקיד לאותה קופה נצטרך את המסמכים הבאים:' +
    '<br><span class="hl">אישור קופה פעילה</span> + <span class="hl">טופס "קוביות"</span> (יש להשיג אותו מהסוכן / חברת הביטוח שלכם).' +
    '<br><br>אם אין ברשותכם את המסמכים — תוכלו לדלג כעת ולהשלים בהמשך, <span class="hl">בחודש הראשון</span> לעבודתכם.';
  intro.style.marginBottom = "6px";
  host.appendChild(intro);

  var box = el("div","fields");
  buildUpload(box, {k:"penDocActive", l:"אישור קופה פעילה", optional:true, noHint:true});
  buildUpload(box, {k:"penDocCubes",  l:"טופס קוביות",      optional:true, noHint:true});
  host.appendChild(box);
  host.appendChild(el("div","err",""));
}

/* ---------- children repeater ---------- */
function buildKids(host){
  var list = el("div","fields");
  if(!s.kids.length){ s.kids.push({name:"",id:"",birth:"",custody:"",allowance:""}); save(); }
  function draw(){
    list.innerHTML="";
    if(!s.kids.length) list.appendChild(el("div","empty","עוד לא הוספת ילדים — "+G("הוסף","הוסיפי")+" ילד/ה כדי להמשיך"));
    s.kids.forEach(function(k,idx){
      var c = el("div","card");
      var head = el("div","card-head");
      head.appendChild(el("h3",null,"ילד/ה "+(idx+1)));
      var del = el("button","link-danger","הסרה"); del.type="button";
      del.onclick = function(){
        s.kids.splice(idx,1);
        if(!s.kids.length){            // הוסר הילד האחרון — חוזרים לשאלת "יש לך ילדים?"
          s.hasKids = "";
          stepIdx = Math.max(0, stepIdx-1);
          save(); render(); scrollTop(); return;
        }
        save(); draw();
      };
      head.appendChild(del);
      c.appendChild(head);

      c.appendChild(subInput("שם",k.name,function(v){k.name=v}));
      var r = el("div","row2");
      r.appendChild(subInput("מספר זהות",k.id,function(v){k.id=v},"numeric",9));
      r.appendChild(subInput("תאריך לידה",k.birth,function(v){k.birth=v},null,null,"date"));
      c.appendChild(r);

      c.appendChild(subToggle("הילד/ה נמצא/ת בחזקתי", k.custody==="yes", function(on){ k.custody = on?"yes":"no"; save(); }));
      c.appendChild(subToggle("אני מקבל/ת עבורו/ה קצבת ילדים מביטוח לאומי", k.allowance==="yes", function(on){ k.allowance = on?"yes":"no"; save(); }));
      list.appendChild(c);
    });
    var add = el("button","add-btn","+ הוספת ילד/ה"); add.type="button";
    add.onclick = function(){ s.kids.push({name:"",id:"",birth:"",custody:"",allowance:""}); save(); draw(); };
    list.appendChild(add);
  }
  draw();
  host.appendChild(list);
  host.appendChild(el("div","err",""));
}

function subInput(label,val,onchg,mode,max,type){
  var d = el("div","field");
  d.appendChild(el("label",null,label));
  var i=document.createElement("input");
  if(type==="date"){
    i.value = isoToDmy(val);
    maskDate(i, function(iso){ onchg(iso); save(); });
    d.appendChild(i);
    return d;
  }
  i.type="text"; i.value=esc(val);
  if(mode) i.inputMode=mode; if(max) i.maxLength=max;
  if(mode==="numeric") i.addEventListener("input",function(){ i.value=i.value.replace(/\D/g,""); });
  i.addEventListener("input",function(){ onchg(i.value); save(); });
  d.appendChild(i);
  return d;
}
function subToggle(label,on,onchg){
  var b = el("button","choice sq"); b.type="button";
  b.setAttribute("role","checkbox"); b.setAttribute("aria-checked", on?"true":"false");
  b.appendChild(el("span","dot")); b.appendChild(el("span","txt",label));
  b.onclick = function(){ on=!on; b.setAttribute("aria-checked",on?"true":"false"); onchg(on); };
  return b;
}

/* ---------- employers repeater ---------- */
function buildEmployers(host){
  var list = el("div","fields");
  function draw(){
    list.innerHTML="";
    if(!s.employers.length) list.appendChild(el("div","empty","עוד לא הוספת מעסיק"));
    s.employers.forEach(function(m,idx){
      var c = el("div","card");
      var head = el("div","card-head");
      head.appendChild(el("h3",null,"מעסיק / משלם משכורת "+(idx+1)));
      var del = el("button","link-danger","הסרה"); del.type="button";
      del.onclick = function(){ s.employers.splice(idx,1); save(); draw(); };
      head.appendChild(del); c.appendChild(head);

      c.appendChild(subInput("שם המעסיק",m.name,function(v){m.name=v}));
      c.appendChild(subInput("כתובת",m.address,function(v){m.address=v}));
      c.appendChild(subInput("מספר תיק ניכויים",m.taxFile,function(v){m.taxFile=v},"numeric",9));

      var kind = el("div","field");
      kind.appendChild(el("label",null,"סוג ההכנסה"));
      var kbox = el("div","choices");
      ["עבודה","קצבה","מלגה","אחר"].forEach(function(o){
        var b=el("button","choice"); b.type="button";
        b.setAttribute("role","radio"); b.setAttribute("aria-checked", m.kind===o?"true":"false");
        b.appendChild(el("span","dot")); b.appendChild(el("span","txt",o));
        b.onclick=function(){ m.kind=o; save();
          kbox.querySelectorAll(".choice").forEach(function(x){x.setAttribute("aria-checked","false")});
          b.setAttribute("aria-checked","true"); };
        kbox.appendChild(b);
      });
      kind.appendChild(kbox); c.appendChild(kind);

      var r = el("div","row2");
      var f1 = subInput("הכנסה חודשית",m.income,function(v){m.income=v},"decimal");
      f1.appendChild(el("div","hint","לפי התלושים"));
      var f2 = subInput("המס שנוכה",m.tax,function(v){m.tax=v},"decimal");
      f2.appendChild(el("div","hint","לפי התלושים"));
      r.appendChild(f1); r.appendChild(f2); c.appendChild(r);

      list.appendChild(c);
    });
    var add = el("button","add-btn", s.employers.length>=3 ? "הגעת למקסימום 3 מעסיקים" : "+ הוספת מעסיק / משלם משכורת");
    add.type="button";
    if(s.employers.length>=3) add.disabled = true;
    add.onclick = function(){
      if(s.employers.length>=3) return;
      s.employers.push({name:"",address:"",taxFile:"",kind:"",income:"",tax:"",slip:""}); save(); draw();
    };
    list.appendChild(add);
    if(s.employers.length>=3){
      var n = el("div","notice info"); n.textContent = "בטופס 101 יש מקום ל-3 מעסיקים. אם יש לך יותר — יש לפנות למשרד.";
      list.appendChild(n);
    }
  }
  draw();
  host.appendChild(list);
  host.appendChild(el("div","err",""));
}

/* ---------- part 8 ---------- */
function buildPart8(host){
  s.p8["1"] = true;   // תושב/ת ישראל — קבוע, לא ניתן לשינוי
  var box = el("div","legal");
  PART8.forEach(function(item){
    var on = !!s.p8[item.n];
    var b = el("button","choice sq"+(item.common?" common":"")+(item.locked?" locked":"")); b.type="button";
    b.setAttribute("role","checkbox"); b.setAttribute("aria-checked", on?"true":"false");
    if(item.locked) b.setAttribute("aria-disabled","true");
    b.appendChild(el("span","num",item.n));
    var txt = el("span","txt");
    txt.appendChild(document.createTextNode(item.t));
    if(item.locked) txt.appendChild(el("small",null,"נבחר אוטומטית"));
    if(item.common) txt.appendChild(el("small","tag","נפוץ"));
    b.appendChild(txt);
    var sub = null;
    function renderSub(){
      if(sub){ sub.remove(); sub=null; }
      if(!s.p8[item.n]) return;
      if(!item.f && !item.auto) return;
      sub = el("div","subfields");
      if(item.f){
        item.f.forEach(function(ff){
          var key = item.n+"_"+ff.k;
          var d = el("div","field");
          d.appendChild(el("label",null,ff.l));
          var i=document.createElement("input");
          if(ff.type==="date"){
            i.value = isoToDmy(s.p8f[key]);
            maskDate(i, function(iso){ s.p8f[key]=iso; save(); });
          } else {
            i.type = "text";
            if(ff.type==="number") i.inputMode="numeric";
            i.value = esc(s.p8f[key]);
            i.addEventListener("input",function(){
              if(ff.type==="number") i.value=i.value.replace(/\D/g,"");
              s.p8f[key]=i.value; save();
            });
          }
          d.appendChild(i);
          sub.appendChild(d);
        });
      }
      if(item.auto){
        var c = kidCounts(item.auto==="custody");
        var rows = [
          ["מספר ילדים שנולדו בשנת המס", c.born],
          ["מספר ילדים שימלאו להם שנה אחת עד שנתיים בשנת המס", c.upTo2],
          ["מספר ילדים שימלאו להם 3 שנים בשנת המס", c.three],
          ["מספר ילדים שימלאו להם 4 שנים עד 5 שנים בשנת המס", c.f4to5],
          ["מספר ילדים שימלאו להם 6 שנים עד 17 שנים בשנת המס", c.s6to17]
        ];
        if(item.auto==="custody") rows.push(["מספר ילדים שימלאו להם 18 שנים בשנת המס", c.e18]);
        var head = el("div","hint","הספירה מחושבת אוטומטית מתאריכי הלידה שמילאת");
        sub.appendChild(head);
        rows.forEach(function(r){
          var line = el("div","autocount");
          line.appendChild(el("span",null,r[0]));
          line.appendChild(el("b",null,String(r[1])));
          sub.appendChild(line);
        });
      }
      b.after(sub);
    }
    b.onclick = function(){
      if(item.locked) return;
      s.p8[item.n] = !s.p8[item.n];
      b.setAttribute("aria-checked", s.p8[item.n]?"true":"false");
      renderSub(); save();
    };
    box.appendChild(b);
    if(on) renderSub();
  });
  host.appendChild(box);
}

/* ---------- signature ---------- */
function buildSign(host){
  var declText = "אני "+G("מצהיר","מצהירה")+" כי הפרטים שמסרתי בטופס זה הינם מלאים ונכונים. ידוע לי שהשמטה או מסירת פרטים לא נכונים הינה עבירה על פקודת מס הכנסה. אני "+G("מתחייב","מתחייבת")+" להודיע למעסיק על כל שינוי שיחול בפרטיי האישיים ובפרטים דלעיל תוך שבוע ימים מתאריך השינוי.";
  var dwrap = el("div","field");
  dwrap.dataset.key = "declConfirmed";
  var db = el("button","choice sq decl-check"); db.type="button";
  db.setAttribute("role","checkbox"); db.setAttribute("aria-checked", s.declConfirmed?"true":"false");
  db.appendChild(el("span","dot"));
  db.appendChild(el("span","txt", declText));
  db.onclick = function(){
    s.declConfirmed = !s.declConfirmed;
    db.setAttribute("aria-checked", s.declConfirmed?"true":"false");
    dwrap.classList.remove("bad"); save();
    updateSigLock();
  };
  dwrap.appendChild(db);
  dwrap.appendChild(el("div","err",""));
  host.appendChild(dwrap);

  var f = el("div","field");
  f.dataset.key = "signature";
  f.appendChild(el("label",null,"חתימה"));
  var wrap = el("div","sigwrap");
  var cv = document.createElement("canvas");
  wrap.appendChild(cv);
  wrap.appendChild(el("div","sigline"));
  wrap.appendChild(el("div","sighint",G("חתום כאן באצבע או בעכבר","חתמי כאן באצבע או בעכבר")));
  var lockNote = el("div","siglock", G("יש לאשר את ההצהרה למעלה כדי לחתום","יש לאשר את ההצהרה למעלה כדי לחתום"));
  wrap.appendChild(lockNote);
  f.appendChild(wrap);
  f.appendChild(el("div","err",""));
  host.appendChild(f);

  // אזור החתימה נעול עד לאישור ההצהרה
  function updateSigLock(){
    wrap.classList.toggle("locked", !s.declConfirmed);
  }

  var actions = el("div","file");
  var clear = el("button","btn btn-soft btn-sm","ניקוי החתימה"); clear.type="button";
  actions.appendChild(clear);
  var dateNote = el("span","hint","תאריך: "+fmtDate(new Date().toISOString().slice(0,10)));
  actions.appendChild(dateNote);
  host.appendChild(actions);

  var ctx, drawing=false, dirty=false, last=null;
  function setup(){
    var rect = wrap.getBoundingClientRect();
    var dpr = window.devicePixelRatio||1;
    cv.width = Math.round(rect.width*dpr);
    cv.height = Math.round(190*dpr);
    ctx = cv.getContext("2d");
    if(!ctx) return;
    ctx.scale(dpr,dpr);
    ctx.lineWidth = 2.2; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.strokeStyle = getComputedStyle(document.body).color;
    if(s.signature){
      var img = new Image();
      img.onload = function(){ ctx.drawImage(img,0,0,rect.width,190); };
      img.src = s.signature;
      wrap.classList.add("signed"); dirty=true;
    }
  }
  function pos(e){
    var r = cv.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  }
  cv.addEventListener("pointerdown",function(e){
    if(!ctx) return;
    if(!s.declConfirmed){
      e.preventDefault();
      dwrap.classList.add("bad");
      dwrap.scrollIntoView({block:"center",behavior:"smooth"});
      return;
    }
    e.preventDefault(); if(cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
    drawing=true; dirty=true; wrap.classList.add("signed");
    last = pos(e); ctx.beginPath(); ctx.moveTo(last.x,last.y);
  });
  cv.addEventListener("pointermove",function(e){
    if(!drawing) return; e.preventDefault();
    var p = pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p;
  });
  function end(){
    if(!drawing) return; drawing=false;
    try{ s.signature = cv.toDataURL("image/png"); s.signDate = new Date().toISOString().slice(0,10); save(); }catch(e){}
    f.classList.remove("bad");
  }
  cv.addEventListener("pointerup",end);
  cv.addEventListener("pointercancel",end);
  cv.addEventListener("pointerleave",end);
  clear.onclick = function(){
    ctx.clearRect(0,0,cv.width,cv.height); dirty=false; wrap.classList.remove("signed");
    s.signature=""; save();
  };
  setTimeout(function(){ setup(); updateSigLock(); },0);
}

/* =========================================================
   validation on "next"
   ========================================================= */
var stepErrBox = null;
function stepError(msg){
  if(stepErrBox){
    stepErrBox.textContent = msg;
    stepErrBox.classList.add("show");
    stepErrBox.scrollIntoView({block:"center",behavior:"smooth"});
  }
  return false;
}
function clearStepError(){ if(stepErrBox) stepErrBox.classList.remove("show"); }

function fail(host,key,msg){
  var node = host ? host.querySelector('[data-key="'+key+'"]') : null;
  if(node){ node.classList.add("bad"); var e=node.querySelector(".err"); if(e) e.textContent=msg; node.scrollIntoView({block:"center",behavior:"smooth"}); }
  else { return stepError(msg); }
  return false;
}
function collect(st){
  var host = main;
  clearStepError();
  if(st.fields){
    for(var i=0;i<st.fields.length;i++){
      var f = st.fields[i];
      if(!f.v) continue;
      var msg = f.v(String(s[f.k]||"").trim());
      if(msg) return fail(host,f.k,msg);
    }
  }
  if(st.choice && !s[st.choice.k]) return stepError("נא לבחור אחת מהאפשרויות כדי להמשיך");
  if(st.penActive && !s.penActive) return stepError("נא לבחור אחת מהאפשרויות כדי להמשיך");
  if(st.multi && s[st.multi.k].length===0) return stepError("נא לבחור לפחות אפשרות אחת כדי להמשיך");
  if(st.kids){
    if(!s.kids.length) return stepError("נא להוסיף ילד/ה, או לחזור אחורה ולסמן שאין ילדים");
    for(var j=0;j<s.kids.length;j++){
      var k = s.kids[j];
      var who = s.kids.length>1 ? "לילד/ה "+(j+1) : "";
      if(!k.name.trim()) return stepError("נא למלא שם "+who);
      if(!k.birth) return stepError("נא למלא תאריך לידה מלא "+who);
      if(k.id && !validIsraeliId(k.id)) return stepError("מספר תעודת זהות לא תקין "+who);
    }
  }
  if(st.employers){
    if(!s.employers.length) return stepError("נא להוסיף מעסיק, או לחזור אחורה ולבחור סיבה אחרת");
    for(var m=0;m<s.employers.length;m++){
      var e2 = s.employers[m];
      if(!e2.name.trim() || !e2.address.trim() || !e2.taxFile.trim() || !e2.kind || !e2.income || !e2.tax)
        return stepError("נא להשלים את כל השדות של מעסיק "+(m+1));
    }
  }
  if(st.upload && !st.upload.optional && !s[st.upload.k]) return stepError("נא לצרף את הקובץ כדי להמשיך");
  if(st.require){
    for(var ri=0;ri<st.require.length;ri++){
      if(!s[st.require[ri].k]) return stepError(st.require[ri].msg || "נא לסמן את תיבת האישור כדי להמשיך");
    }
  }
  if(st.bankSummary && !s.bankConfirm){ return fail(host,"bankConfirm","נא לאשר את ההצהרה כדי להמשיך"); }
  if(st.sign && !s.declConfirmed){ return fail(host,"declConfirmed","נא לאשר את ההצהרה לפני הסיום"); }
  if(st.sign && !s.signature){ return fail(host,"signature","נא לחתום לפני הסיום"); }
  return true;
}

/* =========================================================
   done screen
   ========================================================= */
function renderDone(){
  var w = el("section","done step-anim");
  var seal = el("div","seal");
  seal.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
  w.appendChild(seal);
  w.appendChild(el("h1",null, "כל הכבוד "+s.firstName+"! 🎉"));
  w.appendChild(el("p",null, "סיימת את התהליך — אפשר להוריד את המסמכים שלך למטה."));

  if(s.otherIncome==="yes" && s.taxCoord==="no"){
    var warn = el("div","notice warn");
    warn.innerHTML = "<b>חשוב לפעול בהקדם:</b> אין לך אישור תיאום מס. אם לא "+G("תעביר","תעבירי")+" אישור לפני המשכורת הראשונה שלך בשאול תמרוקים, "+
      "ינוכו לך <b>47% מס</b>. יש להסדיר תיאום מס ולשלוח אותו בהקדם לכתובת: " +
      '<span class="mail-wrap"><a class="mailto" href="mailto:'+HR_MAIL+'">'+HR_MAIL+'</a>' +
      '<button type="button" class="mail-copy" data-copy="'+HR_MAIL+'" aria-label="העתקת כתובת המייל" title="העתקת המייל">📋</button></span>';
    wireMailCopy(warn);
    w.appendChild(warn);
  }

  var pdfActions = el("div","nav nav-center");
  var dl = el("button","btn btn-soft","הורדת טופס 101");
  dl.type="button";
  dl.onclick = function(){ downloadPdf(dl); };
  pdfActions.appendChild(dl);
  w.appendChild(pdfActions);

  // מסמך פנסיה נפרד — רק אם העובד בחר להמשיך להפקיד לקופה הקיימת
  if(s.penContinue === "yes"){
    var penActions = el("div","nav nav-center");
    var penDl = el("button","btn btn-soft","הורדת מסמך פנסיה");
    penDl.type="button";
    penDl.onclick = function(){ downloadPensionPdf(penDl); };
    penActions.appendChild(penDl);
    w.appendChild(penActions);
  }

  main.appendChild(w);
  setTimeout(fireConfetti, 220);
}

/* ---------- confetti ---------- */
function fireConfetti(){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var old = document.getElementById("confetti"); if(old) old.remove();
  var cv = document.createElement("canvas"); cv.id="confetti";
  document.body.appendChild(cv);
  var ctx = cv.getContext("2d");
  if(!ctx){ cv.remove(); return; }
  var dpr = window.devicePixelRatio||1;
  var W = window.innerWidth, H = window.innerHeight;
  cv.width = W*dpr; cv.height = H*dpr; ctx.scale(dpr,dpr);

  var colors = ["#6E2F69","#C77FBE","#00C8A0","#FFC93C","#FF6B6B","#4D96FF",
                "#A97A1F","#F038A6","#9B5DE5","#22C55E","#FF8FB1","#FDE047"];
  var bits = [];
  for(var i=0;i<260;i++){
    bits.push({
      x: W*(0.05+Math.random()*0.9),
      y: -20 - Math.random()*H*0.6,
      w: 7+Math.random()*8,
      h: 10+Math.random()*12,
      vx: (Math.random()-0.5)*2.2,
      vy: 2.4+Math.random()*4,
      rot: Math.random()*Math.PI,
      vr: (Math.random()-0.5)*0.28,
      c: colors[(Math.random()*colors.length)|0],
      sway: Math.random()*Math.PI*2,
      round: Math.random()<0.4
    });
  }
  var start = null, DUR = 5000;
  function frame(t){
    if(start===null) start = t;
    var elapsed = t-start;
    ctx.clearRect(0,0,W,H);
    var fade = elapsed > DUR-900 ? Math.max(0,(DUR-elapsed)/900) : 1;
    ctx.globalAlpha = fade;
    var alive = 0;
    bits.forEach(function(b){
      b.sway += 0.06;
      b.x += b.vx + Math.sin(b.sway)*0.9;
      b.y += b.vy;
      b.rot += b.vr;
      if(b.y < H+40) alive++;
      ctx.save();
      ctx.translate(b.x,b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      if(b.round){
        ctx.beginPath();
        ctx.arc(0,0,b.w/2,0,Math.PI*2);
        ctx.fill();
      } else {
        ctx.fillRect(-b.w/2,-b.h/2,b.w,b.h);
      }
      ctx.restore();
    });
    if(elapsed < DUR && alive>0) requestAnimationFrame(frame);
    else cv.remove();
  }
  requestAnimationFrame(frame);
}

/* ---------- הפקת ה-PDF ---------- */
var pdfBlobCache = null;
function pdfFileName(){ return "טופס101_"+s.firstName+"_"+s.lastName+".pdf"; }

function buildAnswers(){
  var out = {};
  for(var k in s){ out[k] = s[k]; }
  return out;
}

function makePdfBlob(){
  if(pdfBlobCache) return Promise.resolve(pdfBlobCache);
  return import("./pdf.js").then(function(mod){
    return mod.form101Blob(buildAnswers(), String(TAX_YEAR));
  }).then(function(blob){
    pdfBlobCache = blob;
    return blob;
  });
}

function withBusy(btn, label, fn){
  var orig = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  return fn().catch(function(e){
    console.error("pdf error", e);
    alert("שגיאה בהפקת הטופס. נסי שוב.");
  }).finally(function(){
    btn.disabled = false; btn.textContent = orig;
  });
}

function openPdf(btn){
  return withBusy(btn, "מכינים…", function(){
    return makePdfBlob().then(function(blob){
      var url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
    });
  });
}

function downloadPdf(btn){
  return withBusy(btn, "מכינים…", function(){
    return makePdfBlob().then(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = pdfFileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    });
  });
}

function downloadPensionPdf(btn){
  return withBusy(btn, "מכינים…", function(){
    return import("./pension-pdf.js").then(function(mod){
      return mod.pensionLetterBlob({
        firstName: s.firstName, lastName: s.lastName,
        idNum: s.idNum, taxFile: EMPLOYER.taxFile,
      });
    }).then(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "מסמך_פנסיה_"+s.firstName+"_"+s.lastName+".pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    });
  });
}

function downloadSummary(){
  var rows = [];
  document.querySelectorAll(".summary h2, .summary .sumrow").forEach(function(n){
    if(n.tagName==="H2") rows.push("\n== "+n.textContent+" ==");
    else rows.push(n.querySelector("span").textContent + ": " + n.querySelector("b").textContent);
  });
  var txt = "טופס 101 · שאול תמרוקים · שנת המס "+TAX_YEAR+"\n"+
            "מעסיק: "+EMPLOYER.name+" · תיק ניכויים "+EMPLOYER.taxFile+"\n"+
            "סניף: "+SEED.branch+"\n"+rows.join("\n");
  var blob = new Blob(["﻿"+txt],{type:"text/plain;charset=utf-8"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "טופס101_"+s.firstName+"_"+s.lastName+".txt";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
}

/* ---------- boot ---------- */

var TODAY_ISO = new Date().toISOString().slice(0,10);

/**
 * מפעיל את השאלון.
 * opts.profile   — { firstName, lastName, gender, branch, mobile } מ-Firestore
 * opts.draft     — טיוטה שנשמרה בענן, אם קיימת
 * opts.saver     — { queue, flushNow } לשמירת טיוטה
 * opts.submit    — פונקציה להגשה סופית
 * opts.storeKey  — מפתח localStorage ייחודי לעובד
 */
export function startApp(opts){
  opts = opts || {};

  if(opts.profile){
    SEED.firstName = opts.profile.firstName || SEED.firstName;
    SEED.lastName  = opts.profile.lastName  || SEED.lastName;
    SEED.gender    = opts.profile.gender    || SEED.gender;
    SEED.branch    = opts.profile.branch    || SEED.branch;
    SEED.mobile    = opts.profile.mobile    || SEED.mobile;
    s.firstName = SEED.firstName;
    s.lastName  = SEED.lastName;
    s.gender    = SEED.gender;
    s.mobile    = SEED.mobile;
    FRESH.firstName = SEED.firstName;
    FRESH.lastName  = SEED.lastName;
    FRESH.gender    = SEED.gender;
    FRESH.mobile    = SEED.mobile;
  }

  if(opts.storeKey) STORE = opts.storeKey;
  remote = {
    saver: opts.saver || null, submit: opts.submit || null,
    pensionSaver: opts.pensionSaver || null, pensionSubmit: opts.pensionSubmit || null,
  };

  load();

  // טיוטה מהענן גוברת אם היא מתקדמת יותר מזו שבמכשיר
  if(opts.draft && opts.draft.answers && (opts.draft.stepIndex||0) >= stepIdx){
    for(var k in opts.draft.answers){ if(k in s) s[k] = opts.draft.answers[k]; }
    stepIdx = opts.draft.stepIndex || 0;
  }
  if(opts.draft && opts.draft.status === "submitted"){ submitted = true; }
  // טיוטת פנסיה מהענן (מסמך נפרד)
  if(opts.pensionDraft){
    for(var pk in opts.pensionDraft){ if(PENSION_KEYS.indexOf(pk)!==-1) s[pk] = opts.pensionDraft[pk]; }
  }

  if(!s.startDate) s.startDate = TODAY_ISO;   // תחילת עבודה — נקבע אוטומטית, לא נשאל

  // קיצור בדיקה: קפיצה ישירה לחלק הפנסיה (?pension בקישור)
  if(opts.jumpPension){
    if(!s.gender) s.gender = SEED.gender || "f";
    if(!s.birthDate) s.birthDate = "1990-05-05";   // מבוגר/ת, כדי שחלק הפנסיה יופיע
    var vj = visible(), pi = -1;
    for(var ji=0; ji<vj.length; ji++){ if(vj[ji].penActive){ pi = ji; break; } }
    if(pi >= 0){ stepIdx = pi; screen = "form"; submitted = false; }
  } else {
    if(stepIdx>0) screen="welcome";
    if(submitted) screen="done";
  }
  render();
}

var submitted = false;
