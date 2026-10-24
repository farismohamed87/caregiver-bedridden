const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
let nodemailer;try{nodemailer=require('nodemailer')}catch{}
if(fs.existsSync('.env'))fs.readFileSync('.env','utf8').split('\n').forEach(l=>{const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].trim()});
const E=process.env,DB='data/db.json',PUB=path.join(__dirname,'public');
const DATA_KEY=Buffer.from(String(E.DATA_KEY||''),'base64');
if(DATA_KEY.length!==32){console.error('DATA_KEY tidak sah. Jana 32-byte base64 dalam .env (lihat .env.example).');process.exit(1)}
const ENC='enc:v1:';
const enc=v=>{if(v===undefined||v===null||v==='')return v;const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',DATA_KEY,iv),b=Buffer.concat([c.update(String(v),'utf8'),c.final()]);return ENC+Buffer.concat([iv,c.getAuthTag(),b]).toString('base64url')};
const dec=v=>{if(typeof v!=='string'||!v.startsWith(ENC))return v;try{const b=Buffer.from(v.slice(ENC.length),'base64url'),d=crypto.createDecipheriv('aes-256-gcm',DATA_KEY,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')}catch{return v}};
const isEnc=v=>typeof v==='string'&&v.startsWith(ENC);
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const emailIdx=e=>crypto.createHmac('sha256',DATA_KEY).update(String(e||'').trim().toLowerCase()).digest('hex');
const isHash64=v=>/^[0-9a-f]{64}$/.test(String(v||''));
fs.mkdirSync('data/reports',{recursive:true});fs.mkdirSync('data/records',{recursive:true});
const hash=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const check=(p,h)=>{try{const [s,x]=String(h||'').split(':');if(!s||!x)return false;const a=crypto.scryptSync(String(p),s,32),b=Buffer.from(x,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}};
const emailOk=e=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e||''));
const slug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^[-.]+|[-.]+$/g,'').slice(0,24)||('u'+Date.now().toString(36));
const uname=b=>{let n=b,i=1;while(db.users.some(x=>x.username===n))n=b+'-'+(++i);return n};
const code6=()=>String(crypto.randomInt(100000,1000000));
const pub=x=>({username:x.username,email:dec(x.email)||'',name:dec(x.name),role:x.role,status:x.pass?'active':'pending'});
let db=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):{users:[],reports:[]};
db.users=db.users||[];db.inventory=db.inventory||[];db.patient=db.patient||'';db.appointments=db.appointments||[];db.records=db.records||[];db.reports=db.reports||[];
db.ws=db.ws||{};db.codes=db.codes||{};
if(!db.users.length)db.users.push({username:E.ADMIN_USER||'admin',name:enc('Super Admin'),role:'admin',owner:null,pass:hash(E.ADMIN_PASS||'admin123'),verified:true});
if(!db.users.some(x=>x.role==='master')){const mu=E.MASTER_USER||'master';db.users.push({username:db.users.some(x=>String(x.username||'').toLowerCase()===mu.toLowerCase())?uname(slug(mu)):mu,name:enc('Master Admin'),role:'master',owner:null,pass:hash(E.MASTER_PASS||'master123'),verified:true,created:new Date().toISOString()})}
const boot=db.users.find(x=>x.role==='admin'&&!x.owner);
if(boot&&!db.ws[boot.username]&&(db.patient||db.inventory.length||db.appointments.length||db.records.length||db.reports.length)){
 db.ws[boot.username]={patient:db.patient,inventory:db.inventory,appointments:db.appointments,records:db.records,reports:db.reports};
 db.patient='';db.inventory=[];db.appointments=[];db.records=[];db.reports=[]}
if(boot)for(const x of db.users)if(x.role!=='admin'&&x.role!=='master'&&!x.owner)x.owner=boot.username;
for(const x of db.users)if(x.verified===undefined)x.verified=true;
const WS=k=>db.ws[k]||(db.ws[k]={patient:'',inventory:[],appointments:[],records:[],reports:[]});
const ownerOf=u=>u.role==='admin'?u.username:u.role==='master'?u.username:(u.owner||(db.users.find(x=>x.role==='admin'&&!x.owner)||{}).username||'admin');
const findByEmail=em=>{const idx=emailIdx(em),e=String(em||'').trim().toLowerCase();return db.users.find(x=>x.emailIndex===idx||(x.email&&dec(x.email).toLowerCase()===e))};
const save=()=>{for(const k of Object.keys(db.codes))if(db.codes[k].exp<Date.now())delete db.codes[k];fs.writeFileSync(DB,JSON.stringify(db,null,1))};
function migrate(){
 let changed=false;
 for(const u of db.users){
  if(u.email&&!isEnc(u.email)){u.email=enc(String(u.email).trim().toLowerCase());changed=true}
  if(u.name&&!isEnc(u.name)){u.name=enc(u.name);changed=true}
  if(u.email){const idx=emailIdx(dec(u.email));if(u.emailIndex!==idx){u.emailIndex=idx;changed=true}}
  if(u.pending&&u.pending.code&&!u.pending.codeHash){u.pending.codeHash=sha256(u.pending.code);delete u.pending.code;changed=true}
 }
 for(const w of Object.values(db.ws)){
  if(w.patient&&!isEnc(w.patient)){w.patient=enc(w.patient);changed=true}
  if(w.telegram)for(const k of ['token','chatId'])if(w.telegram[k]&&!isEnc(w.telegram[k])){w.telegram[k]=enc(w.telegram[k]);changed=true}
  for(const r of w.reports||[]){
   if(r.patient&&!isEnc(r.patient)){r.patient=enc(r.patient);changed=true}
   if(r.byName&&!isEnc(r.byName)){r.byName=enc(r.byName);changed=true}
  }
  for(const i of w.inventory||[])if(i.by&&!isEnc(i.by)){i.by=enc(i.by);changed=true}
  for(const a of w.appointments||[])if(a.byName&&!isEnc(a.byName)){a.byName=enc(a.byName);changed=true}
  for(const r of w.records||[])if(r.byName&&!isEnc(r.byName)){r.byName=enc(r.byName);changed=true}
 }
 for(const [k,v] of Object.entries(db.codes)){
  let idx=k;
  if(!isHash64(k)){
   const em=String(k).trim().toLowerCase();
   if(!emailOk(em))continue;
   idx=emailIdx(em);
   if(!v.email)v.email=enc(em);
   delete db.codes[k];db.codes[idx]=v;changed=true;
  }
  if(v.name&&!isEnc(v.name)){v.name=enc(v.name);changed=true}
  if(v.code&&!v.codeHash){v.codeHash=sha256(v.code);delete v.code;changed=true}
  if(v.token&&!v.tokenHash){v.tokenHash=sha256(v.token);delete v.token;changed=true}
 }
 let bdir='';
 try{for(const f of fs.readdirSync('data/reports')){if(!f.endsWith('.html'))continue;const fp=path.join('data/reports',f),s=fs.readFileSync(fp,'utf8');if(!s.startsWith(ENC)){if(!bdir){bdir=`data/backup-${Date.now()}`;fs.mkdirSync(bdir,{recursive:true});try{fs.copyFileSync(DB,path.join(bdir,'db.json'))}catch{}}try{fs.copyFileSync(fp,path.join(bdir,f))}catch{}fs.writeFileSync(fp,enc(s));changed=true}}}catch{}
 return changed}
const migrated=migrate();
if(migrated&&fs.existsSync(DB))try{fs.copyFileSync(DB,`data/db.backup-${Date.now()}.json`)}catch{}
save();
const sess={},esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),L=a=>a&&a.length?a.join(', '):'-';
const putFiles=(dir,arr)=>{fs.mkdirSync(dir,{recursive:true});const o=[];for(const f of Array.isArray(arr)?arr:[]){const m=String(f.data||'').match(/^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]+)$/);if(!m)continue;const mime=m[1];if(!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(mime))continue;
 const buf=Buffer.from(m[2],'base64');if(!buf.length||buf.length>12e6)continue;const name=String(f.name||'file').replace(/[^\w.\- ()]/g,'_').slice(0,80)||'file';const id=crypto.randomBytes(6).toString('hex');
 fs.writeFileSync(path.join(dir,id),buf);o.push({id,name,mime,size:buf.length})}return o};
const LBL={
 ms:{patient:'Pesakit',caretaker:'Penjaga',shift:'Syif',temp:'Suhu',spo2:'SpO2 / Oksigen',bp:'Tekanan Darah',hr:'Heart Rate',cough:'Batuk',sugar:'Gula',others:'Lain-lain (keadaan)',milk:'Bagi Susu',pampers:'Tukar Pampers',bath:'Mandian katil / span',bedsore:'Bedsore',yes:'Ada',no:'Tiada',photos:'gambar',meds:'Bagi Ubat',right:'Mengiring ke kanan',left:'Mengiring ke kiri',otherTasks:'Tugas lain',handover:'Nota serah tugas / Handover',reportTitle:'Laporan Harian Penjagaan Pesakit',filename:'Laporan',subject:'Laporan jagaan',sent:'dihantar ✅',failed:'gagal ❌',notConfigured:'tidak dikonfigurasi',alertTitle:'AMARAN: Bacaan tidak normal',alertTempHigh:'Suhu tinggi',alertTempLow:'Suhu rendah',alertSpo2Low:'Oksigen rendah',alertBpHigh:'Tekanan darah tinggi',alertBpLow:'Tekanan darah rendah',alertHrHigh:'Kadar jantung tinggi',alertHrLow:'Kadar jantung rendah',alertSugarHigh:'Gula tinggi',alertSugarLow:'Gula rendah'},
 en:{patient:'Patient',caretaker:'Caretaker',shift:'Shift',temp:'Temperature',spo2:'SpO2 / Oxygen',bp:'Blood Pressure',hr:'Heart Rate',cough:'Cough',sugar:'Sugar',others:'Others (condition)',milk:'Milk Feeding',pampers:'Change Pampers',bath:'Bed bath / sponge bath',bedsore:'Bedsore',yes:'Yes',no:'No',photos:'photo(s)',meds:'Give Medicine',right:'Turn to right',left:'Turn to left',otherTasks:'Other tasks',handover:'Handover Notes',reportTitle:'Daily Patient Care Report',filename:'Report',subject:'Care report',sent:'sent ✅',failed:'failed ❌',notConfigured:'not configured',alertTitle:'WARNING: Abnormal readings',alertTempHigh:'High temperature',alertTempLow:'Low temperature',alertSpo2Low:'Low oxygen',alertBpHigh:'High blood pressure',alertBpLow:'Low blood pressure',alertHrHigh:'High heart rate',alertHrLow:'Low heart rate',alertSugarHigh:'High sugar',alertSugarLow:'Low sugar'}};
const lbl=lang=>LBL[lang==='en'?'en':'ms'];
const numv=x=>{const n=parseFloat(String(x??'').replace(',','.'));return isNaN(n)?null:n};
const alerts=(d,lang)=>{const t=lbl(lang),a=[];
 const temp=numv(d.temp);if(temp!=null){if(temp>37.5)a.push(`${t.alertTempHigh} (${d.temp}°C)`);else if(temp<35)a.push(`${t.alertTempLow} (${d.temp}°C)`)}
 const spo2=numv(d.spo2);if(spo2!=null&&spo2<95)a.push(`${t.alertSpo2Low} (${d.spo2}%)`);
 const m=String(d.bp||'').match(/(\d+)\s*\/\s*(\d+)/);if(m){const s=+m[1],x=+m[2];if(s>=140||x>=90)a.push(`${t.alertBpHigh} (${d.bp})`);else if(s<90||x<60)a.push(`${t.alertBpLow} (${d.bp})`)}
 const hr=numv(d.hr);if(hr!=null){if(hr>100)a.push(`${t.alertHrHigh} (${d.hr})`);else if(hr<60)a.push(`${t.alertHrLow} (${d.hr})`)}
 const su=numv(d.sugar);if(su!=null){if(su>7.8)a.push(`${t.alertSugarHigh} (${d.sugar})`);else if(su<3.9)a.push(`${t.alertSugarLow} (${d.sugar})`)}
 return a};
const rows=(d,u,lang)=>{const t=lbl(lang);const cough=d.cough==='yes'?t.yes:d.cough==='no'?t.no:d.cough;return [[t.patient,d.patient],[t.caretaker,dec(u.name)],[t.shift,`${d.shiftStart} → ${d.shiftEnd}`],[t.temp,d.temp],[t.spo2,d.spo2],[t.bp,d.bp],[t.hr,d.hr],[t.cough,cough],[t.sugar,d.sugar],[t.others,d.others],[t.milk,L(d.milk)],[t.pampers,L(d.pampers)],[t.bath,L(d.bath)],[t.bedsore,d.bedsore==='yes'?`${t.yes} (${(d.photos||[]).length} ${t.photos})`:t.no],[t.meds,L(d.meds)],[t.right,L(d.right)],[t.left,L(d.left)],[t.otherTasks,d.otherTasks],[t.handover,d.handover]].map(([k,v])=>[k,v||'-'])};
const alertBox=(d,lang)=>{const t=lbl(lang),a=alerts(d,lang);return a.length?`<div style="border:2px solid #c0392b;background:#fff0ef;border-radius:8px;padding:10px 14px;margin-top:12px;color:#c0392b"><b>⚠️ ${t.alertTitle}</b><ul style="margin:6px 0 0;padding-left:20px">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''};
const alertText=(d,lang)=>{const t=lbl(lang),a=alerts(d,lang);return a.length?`\n⚠️ ${t.alertTitle}:\n`+a.map(x=>`- ${x}`).join('\n'):''};
const html=(d,u,ts,lang)=>{const t=lbl(lang);return `<!DOCTYPE html><meta charset="utf-8"><title>${t.filename} ${esc(d.patient)}</title><style>body{font-family:Arial;max-width:800px;margin:20px auto}td{border:1px solid #999;padding:6px 10px;vertical-align:top}td:first-child{background:#eef;font-weight:bold;width:34%}table{border-collapse:collapse;width:100%}img{max-width:100%;margin:6px}</style><h2>${t.reportTitle}</h2><p>${ts}</p><table>${rows(d,u,lang).map(([k,v])=>`<tr><td>${k}</td><td>${esc(v).replace(/\n/g,'<br>')}</td></tr>`).join('')}</table>${alertBox(d,lang)}${(d.photos||[]).map(p=>`<img src="${p}">`).join('')}`};
const txt=(d,u,ts,lang)=>{const t=lbl(lang);return `${t.filename.toUpperCase()} (${ts})\n`+rows(d,u,lang).map(([k,v])=>`${k}: ${v}`).join('\n')+alertText(d,lang)};
async function send(d,u,h,tx,lang,tg={}){const s={},t=lbl(lang),warn=alerts(d,lang).length?'⚠️ ':'';
 const tgToken=(tg&&tg.token&&dec(tg.token))||E.TELEGRAM_BOT_TOKEN,tgChat=(tg&&tg.chatId&&dec(tg.chatId))||E.TELEGRAM_CHAT_ID;
 try{if(!nodemailer||!E.SMTP_HOST||!E.MAIL_TO)throw t.notConfigured;await nodemailer.createTransport({host:E.SMTP_HOST,port:+E.SMTP_PORT||587,secure:E.SMTP_PORT==='465',auth:{user:E.SMTP_USER,pass:E.SMTP_PASS}}).sendMail({from:E.SMTP_USER,to:E.MAIL_TO,subject:`${warn}${t.subject}: ${d.patient} (${d.shiftStart} - ${d.shiftEnd})`,html:h,attachments:[{filename:'laporan.html',content:h},...(d.photos||[]).map((x,i)=>({filename:`bedsore${i+1}.jpg`,path:x}))]});s.email=t.sent}catch(e){s.email=t.failed+' '+(e.message||e)}
  try{if(!tgToken||!tgChat)throw t.notConfigured;const api=m=>`https://api.telegram.org/bot${tgToken}/${m}`;
   const x=await fetch(api('sendMessage'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:tgChat,text:tx})});if(!x.ok)throw await x.text();
   for(const ph of d.photos||[]){const f=new FormData();f.append('chat_id',tgChat);f.append('photo',new Blob([Buffer.from(ph.split(',')[1],'base64')],{type:'image/jpeg'}),'bedsore.jpg');await fetch(api('sendPhoto'),{method:'POST',body:f})}

  s.telegram=t.sent}catch(e){s.telegram=t.failed+' '+(e.message||e)}
  return s}
const mailSub=(type,lang)=>type==='register'?(lang==='en'?'Verify your registration':'Sahkan pendaftaran anda'):(lang==='en'?'Caregiver account setup code':'Kod setup akaun penjaga');
const mailBody=(type,lang,cd,em,link)=>type==='register'
 ?(lang==='en'?`Hello,\n\nThank you for registering. Click the link below to verify your email and complete your registration:\n\n${link||'-'}\n\nIf the link does not work, enter this verification code in the app: ${cd}\n\nThe link and code are valid for 24 hours.\n\nEmail: ${em}`:`Hai,\n\nTerima kasih kerana mendaftar. Klik pautan di bawah untuk mengesahkan e-mel dan melengkapkan pendaftaran anda:\n\n${link||'-'}\n\nJika pautan tidak berfungsi, masukkan kod pengesahan ini di aplikasi: ${cd}\n\nPautan dan kod sah selama 24 jam.\n\nE-mel: ${em}`)
 :(lang==='en'?`Hello,\n\nA super admin invited you to the patient care app.\n\nYour setup code is: ${cd}\n\nOpen the app, choose "Set password", then enter your email and this code to choose your own password.\nThe code is valid for 7 days.\n\nEmail: ${em}`:`Hai,\n\nSuper admin telah menjemput anda ke aplikasi penjagaan pesakit.\n\nKod setup anda ialah: ${cd}\n\nBuka aplikasi, pilih "Tetapkan kata laluan", kemudian masukkan e-mel dan kod ini untuk menetapkan kata laluan sendiri.\nKod sah selama 7 hari.\n\nE-mel: ${em}`);
const baseUrl=q=>String(E.APP_URL||'').replace(/\/+$/,'')||`${q.headers['x-forwarded-proto']||'http'}://${q.headers.host||'localhost'}`;
const page=(ok,ms,en)=>`<!DOCTYPE html><html lang="ms"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok?'Pendaftaran disahkan':'Pendaftaran gagal'}</title><body style="font-family:Arial,sans-serif;max-width:520px;margin:48px auto;padding:0 18px;text-align:center;color:#1f2937"><div style="font-size:52px">${ok?'✅':'⚠️'}</div><h2 style="color:${ok?'#15803d':'#b91c1c'}">${ok?'Pendaftaran disahkan':'Pendaftaran gagal'}</h2><p><b>Bahasa Malaysia:</b> ${ms}</p><p><b>English:</b> ${en}</p>${ok?`<p style="margin-top:26px"><a href="/" style="display:inline-block;background:#1d4ed8;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none">Log masuk / Sign in</a></p>`:''}</body></html>`;
async function mail(to,subject,text){try{if(!nodemailer||!E.SMTP_HOST||!E.SMTP_USER)throw new Error('SMTP not configured');
  await nodemailer.createTransport({host:E.SMTP_HOST,port:+E.SMTP_PORT||587,secure:E.SMTP_PORT==='465',auth:{user:E.SMTP_USER,pass:E.SMTP_PASS}}).sendMail({from:E.SMTP_USER,to,subject,text});
  return{ok:true}}catch(e){return{ok:false,err:e.message||String(e)}}}
http.createServer(async(q,r)=>{
 const out=(c,o,t='application/json')=>{r.writeHead(c,{'Content-Type':t+'; charset=utf-8'});r.end(t==='application/json'?JSON.stringify(o):o)};
 const lang=q.headers['x-lang']==='en'?'en':'ms',M=(ms,en)=>lang==='en'?en:ms;
  try{const url=new URL(q.url,'http://x'),p=url.pathname;
  if(!p.startsWith('/api')){const fp=path.join(PUB,path.normalize(p==='/'?'/index.html':p));if(!fp.startsWith(PUB)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory())return out(404,{});return out(200,fs.readFileSync(fp),'text/html')}
  let b='';for await(const c of q){b+=c;if(b.length>2e7)throw new Error(M('Terlalu besar','Too large'))}b=b?JSON.parse(b):{};
   if(p==='/api/login'&&q.method==='POST'){const id=String(b.email||b.username||'').trim().toLowerCase();const u=db.users.find(x=>x.username.toLowerCase()===id)||findByEmail(id);
    if(!u||!u.pass||!check(String(b.password||''),u.pass))return out(401,{error:M('E-mel / kata laluan salah','Incorrect email / password')});
    if(u.verified===false)return out(403,{error:M('Sila sahkan e-mel anda dahulu','Please verify your email first')});
    const t=crypto.randomUUID();sess[t]=u.username;return out(200,{token:t,user:pub(u)})}
   const regOpen=()=>E.REGISTRATION_OPEN!=='0';
   if(p==='/api/verify'&&q.method==='GET'){
    const tk=String(url.searchParams.get('token')||''),tkHash=sha256(tk);
    const key=Object.keys(db.codes).find(k=>db.codes[k].type==='register'&&(db.codes[k].tokenHash===tkHash||db.codes[k].token===tk));
    const rec=key&&db.codes[key];
    if(!rec)return out(400,page(0,'Pautan pengesahan tidak sah atau telah digunakan.','This verification link is invalid or has already been used.'),'text/html');
    if(rec.exp<Date.now()){delete db.codes[key];save();return out(400,page(0,'Pautan sudah luput. Sila daftar semula untuk mendapatkan pautan baharu.','This link has expired. Please register again to get a new link.'),'text/html')}
    const em=dec(rec.email||'');
    if(!emailOk(em))return out(400,page(0,'Pautan pengesahan tidak sah.','Invalid verification link.'),'text/html');
    if(findByEmail(em)){delete db.codes[key];save();return out(400,page(0,'E-mel ini telah didaftarkan. Sila log masuk.','This email is already registered. Please sign in.'),'text/html')}
    const un=uname(slug(em.split('@')[0])),nm=dec(rec.name||'')||em.split('@')[0];
    db.users.push({username:un,email:enc(em),emailIndex:emailIdx(em),name:enc(nm),role:'admin',owner:null,pass:rec.pass,verified:true,created:new Date().toISOString()});
    delete db.codes[key];WS(un);save();
    return out(200,page(1,'E-mel anda telah disahkan dan pendaftaran selesai. Anda boleh log masuk sekarang.','Your email has been verified and your registration is complete. You can sign in now.'),'text/html')}
   if(p==='/api/register'&&q.method==='POST'){
    const em=String(b.email||'').trim().toLowerCase(),nm=String(b.name||'').trim(),pw=String(b.password||'');
    if(!regOpen())return out(403,{error:M('Pendaftaran ditutup','Registration is closed')});
    if(!emailOk(em))return out(400,{error:M('E-mel tidak sah','Invalid email')});
    if(nm.length<2)return out(400,{error:M('Nama diperlukan','Name is required')});
    if(pw.length<6)return out(400,{error:M('Kata laluan min 6 aksara','Password min 6 characters')});
    if(findByEmail(em))return out(409,{error:M('E-mel ini telah didaftarkan','This email is already registered')});
    const idx=emailIdx(em);
    if(String(b.code||'').trim()){
     const rec=db.codes[idx],code=String(b.code||'').trim();
     if(!rec||rec.type!=='register'||(rec.codeHash?rec.codeHash!==sha256(code):rec.code!==code))return out(400,{error:M('Kod pengesahan tidak sah','Invalid verification code')});
     if(rec.exp<Date.now())return out(400,{error:M('Kod sudah luput, minta kod baharu','Code expired, please request a new one')});
     const un=uname(slug(em.split('@')[0]));
     db.users.push({username:un,email:enc(em),emailIndex:idx,name:enc(nm),role:'admin',owner:null,pass:hash(pw),verified:true,created:new Date().toISOString()});
     delete db.codes[idx];WS(un);save();
     const t=crypto.randomUUID();sess[t]=un;
     return out(200,{token:t,user:pub(db.users.find(x=>x.username===un))})}
    const token=crypto.randomBytes(24).toString('hex'),cd=code6();
    db.codes[idx]={codeHash:sha256(cd),tokenHash:sha256(token),email:enc(em),name:enc(nm),pass:hash(pw),type:'register',exp:Date.now()+24*3600*1000};save();
    const link=`${baseUrl(q)}/api/verify?token=${token}`;
    const s=await mail(em,mailSub('register',lang),mailBody('register',lang,cd,em,link));
    return out(200,{ok:1,delivered:s.ok,code:s.ok?null:cd,link:s.ok?null:link,email:em})}
   if(p==='/api/setup'&&q.method==='POST'){
    const em=String(b.email||'').trim().toLowerCase(),cd=String(b.code||'').trim(),pw=String(b.password||''),nm=String(b.name||'').trim();
    const u=findByEmail(em);
    if(!u||!u.pending)return out(400,{error:M('Kod tidak sah','Invalid code')});
    if((u.pending.codeHash?u.pending.codeHash!==sha256(cd):u.pending.code!==cd))return out(400,{error:M('Kod tidak sah','Invalid code')});
    if(u.pending.exp<Date.now())return out(400,{error:M('Kod sudah luput, minta super admin hantar semula','Code expired, please ask your super admin to resend it')});
    if(pw.length<6)return out(400,{error:M('Kata laluan min 6 aksara','Password min 6 characters')});
    u.pass=hash(pw);u.verified=true;delete u.pending;if(nm)u.name=enc(nm);save();
    const t=crypto.randomUUID();sess[t]=u.username;
    return out(200,{token:t,user:pub(u)})}
   const u=db.users.find(x=>x.username===sess[(q.headers.authorization||'').slice(7)]);if(!u)return out(401,{error:M('Sila log masuk','Please log in')});
   if(u.role==='master'){
    if(p==='/api/me')return out(200,pub(u));
    if(p==='/api/master/users'){
     if(q.method==='GET')return out(200,db.users.filter(x=>x.role==='admin').map(x=>({...pub(x),caregivers:db.users.filter(y=>y.role==='caregiver'&&y.owner===x.username).length,created:x.created||''})));
     if(q.method==='POST'){const em=String(b.email||'').trim().toLowerCase(),nm=String(b.name||'').trim(),un=String(b.username||'').trim().toLowerCase(),pw=String(b.password||'');
      if(!/^[a-z0-9._-]{3,24}$/.test(un))return out(400,{error:M('Username mesti 3-24 aksara (huruf, nombor, . _ -)','Username must be 3-24 characters (letters, numbers, . _ -)')});
      if(pw.length<6)return out(400,{error:M('Kata laluan min 6 aksara','Password min 6 characters')});
      if(db.users.some(x=>String(x.username||'').toLowerCase()===un))return out(409,{error:M('Username telah digunakan','Username is already in use')});
      if(em&&!emailOk(em))return out(400,{error:M('E-mel tidak sah','Invalid email')});
      if(em&&findByEmail(em))return out(409,{error:M('E-mel ini telah digunakan','This email is already in use')});
      db.users.push({username:un,...(em?{email:enc(em),emailIndex:emailIdx(em)}:{}),name:enc(nm||un),role:'admin',owner:null,createdBy:u.username,pass:hash(pw),verified:true,created:new Date().toISOString()});WS(un);save();
      return out(200,{ok:1,user:pub(db.users.find(x=>x.username===un))})}
     return out(405,{error:M('Kaedah tidak dibenarkan','Method not allowed')})}
    if(p.startsWith('/api/master/users/')){
     const rest=p.slice(18);
     if(rest.endsWith('/reset')&&q.method==='POST'){const un=decodeURIComponent(rest.slice(0,-6));
      const x=db.users.find(y=>y.username===un&&y.role==='admin');
      if(!x)return out(404,{error:M('Super admin tiada','Super admin not found')});
      let pw=String(b.password||''),gen=false;
      if(!pw){pw=crypto.randomBytes(6).toString('base64url');gen=true}
      if(pw.length<6)return out(400,{error:M('Kata laluan min 6 aksara','Password min 6 characters')});
      x.pass=hash(pw);x.verified=true;delete x.pending;save();
      return out(200,{ok:1,password:gen?pw:undefined,user:pub(x)})}
     if(q.method==='DELETE'){const un=decodeURIComponent(rest);
      const x=db.users.find(y=>y.username===un&&y.role==='admin');
      if(!x)return out(404,{error:M('Super admin tiada','Super admin not found')});
      const owned=db.users.filter(y=>y.role==='caregiver'&&y.owner===x.username).map(y=>y.username);
      const w=db.ws[x.username];
      if(w){for(const rp of w.reports||[])try{fs.unlinkSync(`data/reports/${rp.id}.html`)}catch{};for(const rc of w.records||[])try{fs.rmSync(`data/records/${rc.id}`,{recursive:true,force:true})}catch{}}
      delete db.ws[x.username];
      db.users=db.users.filter(y=>y!==x&&!owned.includes(y.username));save();
      return out(200,{ok:1,removedCaregivers:owned.length})}
     return out(405,{error:M('Kaedah tidak dibenarkan','Method not allowed')})}
    return out(403,{error:M('Akses terhad kepada master admin','Master admin access only')})}
   const adm=u.role==='admin',w=WS(ownerOf(u));
  if(p==='/api/me')return out(200,pub(u));
  if(p==='/api/settings'){
   if(!adm)return out(403,{error:M('Hanya super admin boleh ubah tetapan','Only super admin can change settings')});
   const tg=w.telegram||{};
   if(q.method==='GET')return out(200,{telegram:{chatId:dec(tg.chatId)||'',tokenSet:!!tg.token,tokenHint:tg.token?String(dec(tg.token)).slice(-4):''}});
   if(q.method==='PUT'){const it=b.telegram||{},clear=!!it.clear;
    const chatId=clear?'':String(it.chatId!==undefined?it.chatId:dec(tg.chatId)||'').trim();
    const token=clear?'':(it.token!==undefined&&String(it.token).trim()?String(it.token).trim():(dec(tg.token)||''));
    if(!token||!chatId){delete w.telegram;save();return out(200,{ok:1,enabled:false})}
    w.telegram={token:enc(token),chatId:enc(chatId)};save();return out(200,{ok:1,enabled:true})}
   return out(405,{error:M('Kaedah tidak dibenarkan','Method not allowed')})}
  const now=()=>new Date().toLocaleString(lang==='en'?'en-MY':'ms-MY');
   if(p==='/api/patient'){
    if(q.method==='GET')return out(200,{name:dec(w.patient)||''});
    if(q.method==='PUT'){if(!adm)return out(403,{error:M('Hanya super admin boleh edit nama pesakit','Only super admin can edit patient name')});const n=String(b.name||'').trim();w.patient=enc(n);save();return out(200,{name:n})}}
   if(p==='/api/inventory'){
    if(q.method==='GET')return out(200,w.inventory.map(i=>({...i,by:dec(i.by)})));
    if(q.method==='POST'){if(!adm)return out(403,{error:M('Hanya super admin boleh tambah item','Only super admin can add items')});const n=String(b.name||'').trim();if(!n)return out(400,{error:M('Nama item diperlukan','Item name required')});
     w.inventory.push({id:Date.now(),name:n,unit:String(b.unit||M('unit','unit')),stock:Math.max(0,+b.stock||0),min:Math.max(0,+b.min||0),by:u.name,ts:now()});save();return out(200,{ok:1})}}
   if(p.startsWith('/api/inventory/')){const it=w.inventory.find(x=>String(x.id)===p.slice(15));if(!it)return out(404,{error:M('Item tiada','Item not found')});
    if(q.method==='DELETE'){if(!adm)return out(403,{error:M('Hanya super admin','Super admin only')});w.inventory=w.inventory.filter(x=>x!==it);save();return out(200,{ok:1})}
   if(q.method==='PUT'){if(b.stock!==undefined)it.stock=Math.max(0,+b.stock||0);
    if(adm){if(b.name)it.name=String(b.name).trim();if(b.unit)it.unit=String(b.unit);if(b.min!==undefined)it.min=Math.max(0,+b.min||0)}
    it.by=u.name;it.ts=now();save();return out(200,{ok:1})}}
   if(p==='/api/appointments'){
    if(q.method==='GET')return out(200,w.appointments.map(a=>({...a,byName:dec(a.byName)})));
    if(q.method==='POST'){if(!adm)return out(403,{error:M('Hanya super admin boleh tambah temujanji','Only super admin can add appointments')});const ti=String(b.title||'').trim();if(!ti)return out(400,{error:M('Tajuk temujanji diperlukan','Appointment title required')});if(!b.date)return out(400,{error:M('Tarikh temujanji diperlukan','Appointment date required')});
     w.appointments.push({id:Date.now(),title:ti,date:String(b.date),by:u.username,byName:u.name,ts:now()});save();return out(200,{ok:1})}}
   if(p.startsWith('/api/appointments/')){const ap=w.appointments.find(x=>String(x.id)===p.slice(18));if(!ap)return out(404,{error:M('Temujanji tiada','Appointment not found')});
    if(q.method==='DELETE'){if(!adm)return out(403,{error:M('Hanya super admin','Super admin only')});w.appointments=w.appointments.filter(x=>x!==ap);save();return out(200,{ok:1})}
    if(q.method==='PUT'){if(!adm)return out(403,{error:M('Hanya super admin boleh kemas kini temujanji','Only super admin can update appointments')});
     if(b.title)ap.title=String(b.title).trim();if(b.date)ap.date=String(b.date);ap.by=u.username;ap.byName=u.name;ap.ts=now();save();return out(200,{ok:1})}}
   if(p==='/api/records'){
    if(q.method==='GET')return out(200,w.records.map(r=>({...r,byName:dec(r.byName)})));
    if(q.method==='POST'){if(!adm)return out(403,{error:M('Hanya super admin boleh tambah rekod perubatan','Only super admin can add medical records')});const ti=String(b.title||'').trim();if(!ti)return out(400,{error:M('Tajuk rekod diperlukan','Record title required')});
     const id=Date.now();const files=putFiles(`data/records/${id}`,b.files);
     w.records.push({id,title:ti,cat:String(b.cat||'other'),date:String(b.date||''),notes:String(b.notes||''),files,by:u.username,byName:u.name,ts:now()});save();return out(200,{ok:1,id})}}
   if(p.startsWith('/api/records/')){const fm=p.match(/^\/api\/records\/(\d+)\/files\/([\w-]+)$/);
    if(fm){const rec=w.records.find(x=>String(x.id)===fm[1]);const f=rec&&rec.files.find(x=>x.id===fm[2]);const fp=f&&path.join('data/records',fm[1],f.id);
     if(q.method==='GET'&&f&&fs.existsSync(fp)){r.writeHead(200,{'Content-Type':f.mime,'Content-Disposition':'inline; filename="'+encodeURIComponent(f.name)+'"'});return r.end(fs.readFileSync(fp))}
     if(q.method==='DELETE'){if(!adm)return out(403,{error:M('Hanya super admin','Super admin only')});if(!f)return out(404,{error:M('Fail tiada','File not found')});
      rec.files=rec.files.filter(x=>x!==f);try{fs.unlinkSync(fp)}catch{}rec.by=u.username;rec.byName=u.name;rec.ts=now();save();return out(200,{ok:1})}
     return out(404,{error:M('Fail tiada','File not found')})}
    const rec=w.records.find(x=>String(x.id)===p.slice(13));if(!rec)return out(404,{error:M('Rekod tiada','Record not found')});
    if(q.method==='DELETE'){if(!adm)return out(403,{error:M('Hanya super admin','Super admin only')});try{fs.rmSync(`data/records/${rec.id}`,{recursive:true,force:true})}catch{}
     w.records=w.records.filter(x=>x!==rec);save();return out(200,{ok:1})}
   if(q.method==='PUT'){if(!adm)return out(403,{error:M('Hanya super admin boleh kemas kini rekod','Only super admin can update medical records')});
    if(b.title)rec.title=String(b.title).trim();if(b.cat)rec.cat=String(b.cat);if(b.date!==undefined)rec.date=String(b.date);if(b.notes!==undefined)rec.notes=String(b.notes||'');
    if(Array.isArray(b.removeFiles)){const dir=`data/records/${rec.id}`;for(const fid of b.removeFiles){const f=rec.files.find(x=>x.id===fid);if(f){try{fs.unlinkSync(path.join(dir,f.id))}catch{}}rec.files=rec.files.filter(x=>x.id!==fid)}}
    if(Array.isArray(b.files)&&b.files.length)rec.files.push(...putFiles(`data/records/${rec.id}`,b.files));
    rec.by=u.username;rec.byName=u.name;rec.ts=now();save();return out(200,{ok:1})}}
   if(p==='/api/users'){
    if(!adm)return out(403,{error:M('Hanya super admin boleh urus pengguna','Only super admin can manage users')});
    if(q.method==='GET')return out(200,[pub(u),...db.users.filter(x=>x.username!==u.username&&ownerOf(x)===ownerOf(u)).map(pub)]);
    if(q.method==='POST'){const em=String(b.email||'').trim().toLowerCase(),nm=String(b.name||'').trim(),un=String(b.username||'').trim().toLowerCase(),pw=String(b.password||'');
     if(un||pw){
      if(!/^[a-z0-9._-]{3,24}$/.test(un))return out(400,{error:M('Username mesti 3-24 aksara (huruf, nombor, . _ -)','Username must be 3-24 characters (letters, numbers, . _ -)')});
      if(pw.length<6)return out(400,{error:M('Kata laluan min 6 aksara','Password min 6 characters')});
      if(db.users.some(x=>String(x.username||'').toLowerCase()===un))return out(409,{error:M('Username telah digunakan','Username is already in use')});
      if(em&&!emailOk(em))return out(400,{error:M('E-mel tidak sah','Invalid email')});
      if(em&&findByEmail(em))return out(409,{error:M('E-mel ini telah digunakan','This email is already in use')});
      db.users.push({username:un,...(em?{email:enc(em),emailIndex:emailIdx(em)}:{}),name:enc(nm||un),role:'caregiver',owner:ownerOf(u),pass:hash(pw),verified:true,created:new Date().toISOString()});save();
      return out(200,{ok:1,user:pub(db.users.find(x=>x.username===un))})}
     if(!emailOk(em))return out(400,{error:M('E-mel tidak sah','Invalid email')});
     if(findByEmail(em))return out(409,{error:M('E-mel ini telah digunakan','This email is already in use')});
     const cd=code6(),un2=uname(slug(em.split('@')[0]));
     db.users.push({username:un2,email:enc(em),emailIndex:emailIdx(em),name:enc(nm||em.split('@')[0]),role:'caregiver',owner:ownerOf(u),pass:null,pending:{codeHash:sha256(cd),exp:Date.now()+7*24*3600*1000},created:new Date().toISOString()});save();
     const s=await mail(em,mailSub('setup',lang),mailBody('setup',lang,cd,em));
     return out(200,{ok:1,delivered:s.ok,code:s.ok?null:cd,user:pub(db.users.find(x=>x.username===un2))})}}
   if(p.startsWith('/api/users/')){
    if(!adm)return out(403,{error:M('Hanya super admin boleh urus pengguna','Only super admin can manage users')});
    const rest=p.slice(11);
    if(rest.endsWith('/resend')&&q.method==='POST'){const un=decodeURIComponent(rest.slice(0,-7));
     const x=db.users.find(y=>y.username===un&&ownerOf(y)===ownerOf(u)&&y.role!=='admin');
     if(!x)return out(404,{error:M('Pengguna tiada','User not found')});
     const cd=code6();x.pending={codeHash:sha256(cd),exp:Date.now()+7*24*3600*1000};save();
     const em=dec(x.email),s=await mail(em,mailSub('setup',lang),mailBody('setup',lang,cd,em));
     return out(200,{ok:1,delivered:s.ok,code:s.ok?null:cd})}
    if(rest.endsWith('/reset')&&q.method==='POST'){const un=decodeURIComponent(rest.slice(0,-6));
     const x=db.users.find(y=>y.username===un&&ownerOf(y)===ownerOf(u)&&y.role!=='admin');
     if(!x)return out(404,{error:M('Pengguna tiada','User not found')});
     const pw=String(b.password||'');
     if(pw){if(pw.length<6)return out(400,{error:M('Kata laluan min 6 aksara','Password min 6 characters')});
      x.pass=hash(pw);x.verified=true;delete x.pending;save();return out(200,{ok:1,password:true,user:pub(x)})}
     const em=dec(x.email);
     if(!em)return out(400,{error:M('Pengguna ini tiada e-mel. Masukkan kata laluan baharu.','This user has no email. Enter a new password.')});
     const cd=code6();x.pending={codeHash:sha256(cd),exp:Date.now()+7*24*3600*1000};x.pass=null;x.verified=false;save();
     const s=await mail(em,mailSub('setup',lang),mailBody('setup',lang,cd,em));
     return out(200,{ok:1,delivered:s.ok,code:s.ok?null:cd})}
    if(q.method==='DELETE'){const un=decodeURIComponent(rest);
     if(un===u.username)return out(400,{error:M('Tidak boleh padam akaun sendiri','Cannot delete your own account')});
     const x=db.users.find(y=>y.username===un&&ownerOf(y)===ownerOf(u));
     if(!x)return out(404,{error:M('Pengguna tiada','User not found')});
     db.users=db.users.filter(y=>y!==x);save();return out(200,{ok:1})}}
   if(p==='/api/reports'&&q.method==='POST'){const patient=String(adm?(b.patient??''):(dec(w.patient)||'')).trim();if(!patient||!b.shiftStart||!b.shiftEnd)return out(400,{error:M('Nama pesakit dan masa syif diperlukan','Patient name and shift times are required')});
    if(adm)w.patient=enc(patient);b.patient=patient;
    const ts=now(),id=Date.now(),h=html(b,u,ts,lang),t=txt(b,u,ts,lang);fs.writeFileSync(`data/reports/${id}.html`,enc(h));
    w.reports.push({id,by:u.username,byName:u.name,patient:enc(patient),ts});save();return out(200,{id,text:t,alerts:alerts(b,lang),sent:await send(b,u,h,t,lang,w.telegram)})}
   if(p==='/api/reports'&&q.method==='GET')return out(200,w.reports.filter(x=>adm||x.by===u.username).reverse().map(r=>({...r,patient:dec(r.patient),byName:dec(r.byName)})));
   if(p==='/api/reports'&&q.method==='DELETE'){
    if(!adm)return out(403,{error:M('Hanya super admin boleh padam sejarah','Only super admin can delete history')});
    for(const x of w.reports){try{fs.unlinkSync(`data/reports/${x.id}.html`)}catch{}}
    w.reports=[];save();return out(200,{ok:1})}
   if(p.startsWith('/api/reports/')){
    const x=w.reports.find(x=>String(x.id)===p.slice(13));if(!x||!(adm||x.by===u.username))return out(404,{error:M('Tiada','Not found')});
    if(q.method==='DELETE'){if(!adm)return out(403,{error:M('Hanya super admin boleh padam sejarah','Only super admin can delete history')});
     w.reports=w.reports.filter(y=>y!==x);try{fs.unlinkSync(`data/reports/${x.id}.html`)}catch{};save();return out(200,{ok:1})}
    return out(200,dec(fs.readFileSync(`data/reports/${x.id}.html`,'utf8')),'text/html')}
  out(404,{error:M('Tidak dijumpai','Not found')})}catch(e){out(500,{error:e.message||M('Ralat','Error')})}
}).listen(E.PORT||3000,()=>console.log('Sedia di http://localhost:'+(E.PORT||3000)));
