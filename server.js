const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
let nodemailer;try{nodemailer=require('nodemailer')}catch{}
if(fs.existsSync('.env'))fs.readFileSync('.env','utf8').split('\n').forEach(l=>{const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].trim()});
const E=process.env,DB='data/db.json',PUB=path.join(__dirname,'public');
fs.mkdirSync('data/reports',{recursive:true});
const hash=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const check=(p,h)=>hash(p,h.split(':')[0])===h;
let db=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):{users:[{username:E.ADMIN_USER||'admin',name:'Super Admin',role:'admin',pass:hash(E.ADMIN_PASS||'admin123')}],reports:[]};
db.inventory=db.inventory||[];db.patient=db.patient||'';
const save=()=>fs.writeFileSync(DB,JSON.stringify(db,null,1));save();
const sess={},esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),L=a=>a&&a.length?a.join(', '):'-';
const LBL={
 ms:{patient:'Pesakit',caretaker:'Penjaga',shift:'Syif',temp:'Suhu',spo2:'SpO2 / Oksigen',bp:'Tekanan Darah',hr:'Heart Rate',cough:'Batuk',sugar:'Gula',others:'Lain-lain (keadaan)',milk:'Bagi Susu',pampers:'Tukar Pampers',bedsore:'Bedsore',yes:'Ada',no:'Tiada',photos:'gambar',meds:'Bagi Ubat',right:'Mengiring ke kanan',left:'Mengiring ke kiri',otherTasks:'Tugas lain',handover:'Nota serah tugas / Handover',reportTitle:'Laporan Harian Penjagaan Pesakit',filename:'Laporan',subject:'Laporan jagaan',sent:'dihantar ✅',failed:'gagal ❌',notConfigured:'tidak dikonfigurasi',alertTitle:'AMARAN: Bacaan tidak normal',alertTempHigh:'Suhu tinggi',alertTempLow:'Suhu rendah',alertSpo2Low:'Oksigen rendah',alertBpHigh:'Tekanan darah tinggi',alertBpLow:'Tekanan darah rendah',alertHrHigh:'Kadar jantung tinggi',alertHrLow:'Kadar jantung rendah',alertSugarHigh:'Gula tinggi',alertSugarLow:'Gula rendah'},
 en:{patient:'Patient',caretaker:'Caretaker',shift:'Shift',temp:'Temperature',spo2:'SpO2 / Oxygen',bp:'Blood Pressure',hr:'Heart Rate',cough:'Cough',sugar:'Sugar',others:'Others (condition)',milk:'Milk Feeding',pampers:'Change Pampers',bedsore:'Bedsore',yes:'Yes',no:'No',photos:'photo(s)',meds:'Give Medicine',right:'Turn to right',left:'Turn to left',otherTasks:'Other tasks',handover:'Handover Notes',reportTitle:'Daily Patient Care Report',filename:'Report',subject:'Care report',sent:'sent ✅',failed:'failed ❌',notConfigured:'not configured',alertTitle:'WARNING: Abnormal readings',alertTempHigh:'High temperature',alertTempLow:'Low temperature',alertSpo2Low:'Low oxygen',alertBpHigh:'High blood pressure',alertBpLow:'Low blood pressure',alertHrHigh:'High heart rate',alertHrLow:'Low heart rate',alertSugarHigh:'High sugar',alertSugarLow:'Low sugar'}};
const lbl=lang=>LBL[lang==='en'?'en':'ms'];
const numv=x=>{const n=parseFloat(String(x??'').replace(',','.'));return isNaN(n)?null:n};
const alerts=(d,lang)=>{const t=lbl(lang),a=[];
 const temp=numv(d.temp);if(temp!=null){if(temp>37.5)a.push(`${t.alertTempHigh} (${d.temp}°C)`);else if(temp<35)a.push(`${t.alertTempLow} (${d.temp}°C)`)}
 const spo2=numv(d.spo2);if(spo2!=null&&spo2<95)a.push(`${t.alertSpo2Low} (${d.spo2}%)`);
 const m=String(d.bp||'').match(/(\d+)\s*\/\s*(\d+)/);if(m){const s=+m[1],x=+m[2];if(s>=140||x>=90)a.push(`${t.alertBpHigh} (${d.bp})`);else if(s<90||x<60)a.push(`${t.alertBpLow} (${d.bp})`)}
 const hr=numv(d.hr);if(hr!=null){if(hr>100)a.push(`${t.alertHrHigh} (${d.hr})`);else if(hr<60)a.push(`${t.alertHrLow} (${d.hr})`)}
 const su=numv(d.sugar);if(su!=null){if(su>7.8)a.push(`${t.alertSugarHigh} (${d.sugar})`);else if(su<3.9)a.push(`${t.alertSugarLow} (${d.sugar})`)}
 return a};
const rows=(d,u,lang)=>{const t=lbl(lang);const cough=d.cough==='yes'?t.yes:d.cough==='no'?t.no:d.cough;return [[t.patient,d.patient],[t.caretaker,u.name],[t.shift,`${d.shiftStart} → ${d.shiftEnd}`],[t.temp,d.temp],[t.spo2,d.spo2],[t.bp,d.bp],[t.hr,d.hr],[t.cough,cough],[t.sugar,d.sugar],[t.others,d.others],[t.milk,L(d.milk)],[t.pampers,L(d.pampers)],[t.bedsore,d.bedsore==='yes'?`${t.yes} (${(d.photos||[]).length} ${t.photos})`:t.no],[t.meds,L(d.meds)],[t.right,L(d.right)],[t.left,L(d.left)],[t.otherTasks,d.otherTasks],[t.handover,d.handover]].map(([k,v])=>[k,v||'-'])};
const alertBox=(d,lang)=>{const t=lbl(lang),a=alerts(d,lang);return a.length?`<div style="border:2px solid #c0392b;background:#fff0ef;border-radius:8px;padding:10px 14px;margin-top:12px;color:#c0392b"><b>⚠️ ${t.alertTitle}</b><ul style="margin:6px 0 0;padding-left:20px">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''};
const alertText=(d,lang)=>{const t=lbl(lang),a=alerts(d,lang);return a.length?`\n⚠️ ${t.alertTitle}:\n`+a.map(x=>`- ${x}`).join('\n'):''};
const html=(d,u,ts,lang)=>{const t=lbl(lang);return `<!DOCTYPE html><meta charset="utf-8"><title>${t.filename} ${esc(d.patient)}</title><style>body{font-family:Arial;max-width:800px;margin:20px auto}td{border:1px solid #999;padding:6px 10px;vertical-align:top}td:first-child{background:#eef;font-weight:bold;width:34%}table{border-collapse:collapse;width:100%}img{max-width:100%;margin:6px}</style><h2>${t.reportTitle}</h2><p>${ts}</p><table>${rows(d,u,lang).map(([k,v])=>`<tr><td>${k}</td><td>${esc(v).replace(/\n/g,'<br>')}</td></tr>`).join('')}</table>${alertBox(d,lang)}${(d.photos||[]).map(p=>`<img src="${p}">`).join('')}`};
const txt=(d,u,ts,lang)=>{const t=lbl(lang);return `${t.filename.toUpperCase()} (${ts})\n`+rows(d,u,lang).map(([k,v])=>`${k}: ${v}`).join('\n')+alertText(d,lang)};
async function send(d,u,h,tx,lang){const s={},t=lbl(lang),warn=alerts(d,lang).length?'⚠️ ':'';
 try{if(!nodemailer||!E.SMTP_HOST||!E.MAIL_TO)throw t.notConfigured;await nodemailer.createTransport({host:E.SMTP_HOST,port:+E.SMTP_PORT||587,secure:E.SMTP_PORT==='465',auth:{user:E.SMTP_USER,pass:E.SMTP_PASS}}).sendMail({from:E.SMTP_USER,to:E.MAIL_TO,subject:`${warn}${t.subject}: ${d.patient} (${d.shiftStart} - ${d.shiftEnd})`,html:h,attachments:[{filename:'laporan.html',content:h},...(d.photos||[]).map((x,i)=>({filename:`bedsore${i+1}.jpg`,path:x}))]});s.email=t.sent}catch(e){s.email=t.failed+' '+(e.message||e)}
 try{if(!E.TELEGRAM_BOT_TOKEN||!E.TELEGRAM_CHAT_ID)throw t.notConfigured;const api=m=>`https://api.telegram.org/bot${E.TELEGRAM_BOT_TOKEN}/${m}`;
  const x=await fetch(api('sendMessage'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:E.TELEGRAM_CHAT_ID,text:tx})});if(!x.ok)throw await x.text();
  for(const ph of d.photos||[]){const f=new FormData();f.append('chat_id',E.TELEGRAM_CHAT_ID);f.append('photo',new Blob([Buffer.from(ph.split(',')[1],'base64')],{type:'image/jpeg'}),'bedsore.jpg');await fetch(api('sendPhoto'),{method:'POST',body:f})}
  s.telegram=t.sent}catch(e){s.telegram=t.failed+' '+(e.message||e)}
 return s}
http.createServer(async(q,r)=>{
 const out=(c,o,t='application/json')=>{r.writeHead(c,{'Content-Type':t+'; charset=utf-8'});r.end(t==='application/json'?JSON.stringify(o):o)};
 const lang=q.headers['x-lang']==='en'?'en':'ms',M=(ms,en)=>lang==='en'?en:ms;
 try{const p=new URL(q.url,'http://x').pathname;
  if(!p.startsWith('/api')){const fp=path.join(PUB,path.normalize(p==='/'?'/index.html':p));if(!fp.startsWith(PUB)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory())return out(404,{});return out(200,fs.readFileSync(fp),'text/html')}
  let b='';for await(const c of q){b+=c;if(b.length>2e7)throw new Error(M('Terlalu besar','Too large'))}b=b?JSON.parse(b):{};
  if(p==='/api/login'&&q.method==='POST'){const u=db.users.find(x=>x.username===b.username);if(!u||!check(String(b.password||''),u.pass))return out(401,{error:M('Nama pengguna / kata laluan salah','Incorrect username / password')});const t=crypto.randomUUID();sess[t]=u.username;return out(200,{token:t,user:{username:u.username,name:u.name,role:u.role}})}
  const u=db.users.find(x=>x.username===sess[(q.headers.authorization||'').slice(7)]);if(!u)return out(401,{error:M('Sila log masuk','Please log in')});
  const adm=u.role==='admin',pub=x=>({username:x.username,name:x.name,role:x.role});
  if(p==='/api/me')return out(200,pub(u));
  const now=()=>new Date().toLocaleString(lang==='en'?'en-MY':'ms-MY');
  if(p==='/api/patient'){
   if(q.method==='GET')return out(200,{name:db.patient});
   if(q.method==='PUT'){if(!adm)return out(403,{error:M('Hanya super admin boleh edit nama pesakit','Only super admin can edit patient name')});db.patient=String(b.name||'').trim();save();return out(200,{name:db.patient})}}
  if(p==='/api/inventory'){
   if(q.method==='GET')return out(200,db.inventory);
   if(q.method==='POST'){if(!adm)return out(403,{error:M('Hanya super admin boleh tambah item','Only super admin can add items')});const n=String(b.name||'').trim();if(!n)return out(400,{error:M('Nama item diperlukan','Item name required')});
    db.inventory.push({id:Date.now(),name:n,unit:String(b.unit||M('unit','unit')),stock:Math.max(0,+b.stock||0),min:Math.max(0,+b.min||0),by:u.name,ts:now()});save();return out(200,{ok:1})}}
  if(p.startsWith('/api/inventory/')){const it=db.inventory.find(x=>String(x.id)===p.slice(15));if(!it)return out(404,{error:M('Item tiada','Item not found')});
   if(q.method==='DELETE'){if(!adm)return out(403,{error:M('Hanya super admin','Super admin only')});db.inventory=db.inventory.filter(x=>x!==it);save();return out(200,{ok:1})}
   if(q.method==='PUT'){if(b.stock!==undefined)it.stock=Math.max(0,+b.stock||0);
    if(adm){if(b.name)it.name=String(b.name).trim();if(b.unit)it.unit=String(b.unit);if(b.min!==undefined)it.min=Math.max(0,+b.min||0)}
    it.by=u.name;it.ts=now();save();return out(200,{ok:1})}}
  if(p==='/api/users'&&adm){
   if(q.method==='GET')return out(200,db.users.map(pub));
   if(q.method==='POST'){const n=String(b.username||'').trim().toLowerCase();if(!/^[a-z0-9._-]{3,}$/.test(n)||!b.name||String(b.password||'').length<6)return out(400,{error:M('Username min 3 aksara, nama diperlukan, kata laluan min 6 aksara','Username min 3 characters, name required, password min 6 characters')});if(db.users.some(x=>x.username===n))return out(400,{error:M('Username sudah wujud','Username already exists')});db.users.push({username:n,name:String(b.name),role:'caregiver',pass:hash(b.password)});save();return out(200,{ok:1})}}
  if(p.startsWith('/api/users/')&&q.method==='DELETE'&&adm){const n=decodeURIComponent(p.slice(11));if(n===u.username)return out(400,{error:M('Tidak boleh padam akaun sendiri','Cannot delete your own account')});db.users=db.users.filter(x=>x.username!==n);save();return out(200,{ok:1})}
  if(p==='/api/reports'&&q.method==='POST'){const patient=String(adm?b.patient??'':db.patient||'').trim();if(!patient||!b.shiftStart||!b.shiftEnd)return out(400,{error:M('Nama pesakit dan masa syif diperlukan','Patient name and shift times are required')});
   if(adm)db.patient=patient;b.patient=patient;
   const ts=now(),id=Date.now(),h=html(b,u,ts,lang),t=txt(b,u,ts,lang);fs.writeFileSync(`data/reports/${id}.html`,h);
   db.reports.push({id,by:u.username,byName:u.name,patient,ts});save();return out(200,{id,text:t,alerts:alerts(b,lang),sent:await send(b,u,h,t,lang)})}
  if(p==='/api/reports'&&q.method==='GET')return out(200,db.reports.filter(x=>adm||x.by===u.username).reverse());
  if(p.startsWith('/api/reports/')){const x=db.reports.find(x=>String(x.id)===p.slice(13));if(!x||!(adm||x.by===u.username))return out(404,{error:M('Tiada','Not found')});return out(200,fs.readFileSync(`data/reports/${x.id}.html`),'text/html')}
  out(404,{error:M('Tidak dijumpai','Not found')})}catch(e){out(500,{error:e.message||M('Ralat','Error')})}
}).listen(E.PORT||3000,()=>console.log('Sedia di http://localhost:'+(E.PORT||3000)));
