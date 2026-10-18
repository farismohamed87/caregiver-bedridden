const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
let nodemailer;try{nodemailer=require('nodemailer')}catch{}
if(fs.existsSync('.env'))fs.readFileSync('.env','utf8').split('\n').forEach(l=>{const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].trim()});
const E=process.env,DB='data/db.json',PUB=path.join(__dirname,'public');
fs.mkdirSync('data/reports',{recursive:true});
const hash=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const check=(p,h)=>hash(p,h.split(':')[0])===h;
let db=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):{users:[{username:E.ADMIN_USER||'admin',name:'Super Admin',role:'admin',pass:hash(E.ADMIN_PASS||'admin123')}],reports:[]};
const save=()=>fs.writeFileSync(DB,JSON.stringify(db,null,1));save();
const sess={},esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),L=a=>a&&a.length?a.join(', '):'-';
const rows=(d,u)=>[['Pesakit / Patient',d.patient],['Penjaga / Caretaker',u.name],['Syif / Shift',`${d.shiftStart} → ${d.shiftEnd}`],['Suhu / Temperature',d.temp],['SpO2 / Oksigen',d.spo2],['Tekanan Darah / BP',d.bp],['Heart Rate',d.hr],['Batuk / Cough',d.cough],['Gula / Sugar',d.sugar],['Lain-lain (keadaan)',d.others],['Bagi Susu',L(d.milk)],['Tukar Pampers',L(d.pampers)],['Bedsore',d.bedsore==='yes'?`Ada (${(d.photos||[]).length} gambar)`:'Tiada'],['Bagi Ubat',L(d.meds)],['Mengiring ke kanan',L(d.right)],['Mengiring ke kiri',L(d.left)],['Tugas lain',d.otherTasks],['Nota serah tugas / Handover',d.handover]].map(([k,v])=>[k,v||'-']);
const html=(d,u,ts)=>`<!DOCTYPE html><meta charset="utf-8"><title>Laporan ${esc(d.patient)}</title><style>body{font-family:Arial;max-width:800px;margin:20px auto}td{border:1px solid #999;padding:6px 10px;vertical-align:top}td:first-child{background:#eef;font-weight:bold;width:34%}table{border-collapse:collapse;width:100%}img{max-width:100%;margin:6px}</style><h2>Laporan Harian Penjagaan Pesakit</h2><p>${ts}</p><table>${rows(d,u).map(([k,v])=>`<tr><td>${k}</td><td>${esc(v).replace(/\n/g,'<br>')}</td></tr>`).join('')}</table>${(d.photos||[]).map(p=>`<img src="${p}">`).join('')}`;
const txt=(d,u,ts)=>`LAPORAN PENJAGAAN (${ts})\n`+rows(d,u).map(([k,v])=>`${k}: ${v}`).join('\n');
async function send(d,u,h,t){const s={};
 try{if(!nodemailer||!E.SMTP_HOST||!E.MAIL_TO)throw'tidak dikonfigurasi';await nodemailer.createTransport({host:E.SMTP_HOST,port:+E.SMTP_PORT||587,secure:E.SMTP_PORT==='465',auth:{user:E.SMTP_USER,pass:E.SMTP_PASS}}).sendMail({from:E.SMTP_USER,to:E.MAIL_TO,subject:`Laporan jagaan: ${d.patient} (${d.shiftStart} - ${d.shiftEnd})`,html:h,attachments:[{filename:'laporan.html',content:h},...(d.photos||[]).map((x,i)=>({filename:`bedsore${i+1}.jpg`,path:x}))]});s.email='dihantar ✅'}catch(e){s.email='gagal ❌ '+(e.message||e)}
 try{if(!E.TELEGRAM_BOT_TOKEN||!E.TELEGRAM_CHAT_ID)throw'tidak dikonfigurasi';const api=m=>`https://api.telegram.org/bot${E.TELEGRAM_BOT_TOKEN}/${m}`;
  const x=await fetch(api('sendMessage'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:E.TELEGRAM_CHAT_ID,text:t})});if(!x.ok)throw await x.text();
  for(const ph of d.photos||[]){const f=new FormData();f.append('chat_id',E.TELEGRAM_CHAT_ID);f.append('photo',new Blob([Buffer.from(ph.split(',')[1],'base64')],{type:'image/jpeg'}),'bedsore.jpg');await fetch(api('sendPhoto'),{method:'POST',body:f})}
  s.telegram='dihantar ✅'}catch(e){s.telegram='gagal ❌ '+(e.message||e)}
 return s}
http.createServer(async(q,r)=>{
 const out=(c,o,t='application/json')=>{r.writeHead(c,{'Content-Type':t+'; charset=utf-8'});r.end(t==='application/json'?JSON.stringify(o):o)};
 try{const p=new URL(q.url,'http://x').pathname;
  if(!p.startsWith('/api')){const fp=path.join(PUB,path.normalize(p==='/'?'/index.html':p));if(!fp.startsWith(PUB)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory())return out(404,{});return out(200,fs.readFileSync(fp),'text/html')}
  let b='';for await(const c of q){b+=c;if(b.length>2e7)throw new Error('Terlalu besar')}b=b?JSON.parse(b):{};
  if(p==='/api/login'&&q.method==='POST'){const u=db.users.find(x=>x.username===b.username);if(!u||!check(String(b.password||''),u.pass))return out(401,{error:'Nama pengguna / kata laluan salah'});const t=crypto.randomUUID();sess[t]=u.username;return out(200,{token:t,user:{username:u.username,name:u.name,role:u.role}})}
  const u=db.users.find(x=>x.username===sess[(q.headers.authorization||'').slice(7)]);if(!u)return out(401,{error:'Sila log masuk'});
  const adm=u.role==='admin',pub=x=>({username:x.username,name:x.name,role:x.role});
  if(p==='/api/me')return out(200,pub(u));
  if(p==='/api/users'&&adm){
   if(q.method==='GET')return out(200,db.users.map(pub));
   if(q.method==='POST'){const n=String(b.username||'').trim().toLowerCase();if(!/^[a-z0-9._-]{3,}$/.test(n)||!b.name||String(b.password||'').length<6)return out(400,{error:'Username min 3 aksara, nama diperlukan, kata laluan min 6 aksara'});if(db.users.some(x=>x.username===n))return out(400,{error:'Username sudah wujud'});db.users.push({username:n,name:String(b.name),role:'caregiver',pass:hash(b.password)});save();return out(200,{ok:1})}}
  if(p.startsWith('/api/users/')&&q.method==='DELETE'&&adm){const n=decodeURIComponent(p.slice(11));if(n===u.username)return out(400,{error:'Tidak boleh padam akaun sendiri'});db.users=db.users.filter(x=>x.username!==n);save();return out(200,{ok:1})}
  if(p==='/api/reports'&&q.method==='POST'){if(!b.patient||!b.shiftStart||!b.shiftEnd)return out(400,{error:'Nama pesakit dan masa syif diperlukan'});
   const ts=new Date().toLocaleString('ms-MY'),id=Date.now(),h=html(b,u,ts),t=txt(b,u,ts);fs.writeFileSync(`data/reports/${id}.html`,h);
   db.reports.push({id,by:u.username,byName:u.name,patient:b.patient,ts});save();return out(200,{id,text:t,sent:await send(b,u,h,t)})}
  if(p==='/api/reports'&&q.method==='GET')return out(200,db.reports.filter(x=>adm||x.by===u.username).reverse());
  if(p.startsWith('/api/reports/')){const x=db.reports.find(x=>String(x.id)===p.slice(13));if(!x||!(adm||x.by===u.username))return out(404,{error:'Tiada'});return out(200,fs.readFileSync(`data/reports/${x.id}.html`),'text/html')}
  out(404,{error:'Tidak dijumpai'})}catch(e){out(500,{error:e.message||'Ralat'})}
}).listen(E.PORT||3000,()=>console.log('Sedia di http://localhost:'+(E.PORT||3000)));
