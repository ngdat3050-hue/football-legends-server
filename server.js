import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'database.json');
const PORT = Number(process.env.PORT || 10000);
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@12345';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

function readDb(){
  try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); }
  catch { return { users:{}, sessions:{}, market:{}, logs:[] }; }
}
let db = readDb();
function writeDb(){ const tmp=DB_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(db,null,2)); fs.renameSync(tmp,DB_FILE); }
function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(password,salt,64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored){
  const [salt,hash]=String(stored).split(':');
  if(!salt||!hash)return false;
  const check=crypto.scryptSync(password,salt,64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(check,'hex'));
}
function newId(){
  let id;
  do { id=String(crypto.randomInt(1000000000,10000000000)); } while(Object.values(db.users).some(u=>u.id===id));
  return id;
}
function cleanState(s={}){
  return {
    coins: Math.max(0,Number(s.coins)||0), gems:Math.max(0,Number(s.gems)||0), tickets:Math.max(0,Number(s.tickets)||0),
    owned:Array.isArray(s.owned)?s.owned.filter(x=>typeof x==='string').slice(0,5000):[],
    level:Math.max(1,Number(s.level)||1), xp:Math.max(0,Number(s.xp)||0),
    squad:Array.isArray(s.squad)?s.squad.slice(0,20):[], formation:String(s.formation||'4-3-3'),
    packCounts:typeof s.packCounts==='object'&&s.packCounts?s.packCounts:{},
    mailbox:Array.isArray(s.mailbox)?s.mailbox.slice(0,200):[],
    prices:typeof s.prices==='object'&&s.prices?s.prices:{}
  };
}
function publicUser(u){ return {id:u.id,username:u.username,nickname:u.nickname,role:u.role,title:u.title,avatar:u.avatar,createdAt:u.createdAt,...cleanState(u.state)}; }
function token(){ return crypto.randomBytes(32).toString('hex'); }
function auth(req,res,next){
  const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const username=db.sessions[t];
  if(!username||!db.users[username])return res.status(401).json({error:'UNAUTHORIZED'});
  req.user=db.users[username]; req.username=username; next();
}
function admin(req,res,next){ if(req.user.role!=='admin')return res.status(403).json({error:'ADMIN_ONLY'}); next(); }

if(!db.users[ADMIN_USER]){
  db.users[ADMIN_USER]={username:ADMIN_USER,passwordHash:hashPassword(ADMIN_PASS),role:'admin',id:'0000000001',nickname:'ADMIN',title:'👑 OWNER',avatar:'👑',createdAt:new Date().toISOString(),state:{coins:999999999,gems:999999,tickets:9999,owned:[],level:99,xp:0,squad:[],formation:'4-3-3',packCounts:{},mailbox:[],prices:{}}};
  writeDb();
}

const app=express();
app.use(cors({origin:CORS_ORIGIN==='*'?true:CORS_ORIGIN}));
app.use(express.json({limit:'1mb'}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'football-legends-server',time:new Date().toISOString()}));

app.post('/api/register',(req,res)=>{
  const username=String(req.body.username||'').trim(); const password=String(req.body.password||''); const nickname=String(req.body.nickname||username).trim().slice(0,30);
  if(!/^[A-Za-z0-9_]{3,24}$/.test(username))return res.status(400).json({error:'Tên tài khoản không hợp lệ'});
  if(password.length<6)return res.status(400).json({error:'Mật khẩu tối thiểu 6 ký tự'});
  const key=Object.keys(db.users).find(k=>k.toLowerCase()===username.toLowerCase()); if(key)return res.status(409).json({error:'Tài khoản đã tồn tại'});
  db.users[username]={username,passwordHash:hashPassword(password),role:'player',id:newId(),nickname,title:'🏅 PACK BEGINNER',avatar:'⚽',createdAt:new Date().toISOString(),state:{coins:2580000,gems:320,tickets:12,owned:[],level:1,xp:0,squad:[],formation:'4-3-3',packCounts:{},mailbox:[],prices:{}}};
  const t=token(); db.sessions[t]=username; writeDb(); res.json({token:t,user:publicUser(db.users[username])});
});
app.post('/api/login',(req,res)=>{
  const username=String(req.body.username||'').trim(); const password=String(req.body.password||''); const key=Object.keys(db.users).find(k=>k.toLowerCase()===username.toLowerCase());
  if(!key||!verifyPassword(password,db.users[key].passwordHash))return res.status(401).json({error:'Sai tài khoản hoặc mật khẩu'});
  const t=token(); db.sessions[t]=key; writeDb(); res.json({token:t,user:publicUser(db.users[key])});
});
app.post('/api/logout',auth,(req,res)=>{const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');delete db.sessions[t];writeDb();res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.put('/api/state',auth,(req,res)=>{req.user.state=cleanState(req.body.state);writeDb();res.json({ok:true,user:publicUser(req.user)});});
app.get('/api/users/:id',auth,(req,res)=>{const u=Object.values(db.users).find(x=>x.id===String(req.params.id));if(!u)return res.status(404).json({error:'ID_NOT_FOUND'});res.json({user:{id:u.id,username:u.username,nickname:u.nickname,title:u.title,avatar:u.avatar,role:u.role}});});
app.post('/api/gifts',auth,(req,res)=>{
  const toId=String(req.body.toId||''); const type=String(req.body.type||''); const amount=Math.max(1,Math.floor(Number(req.body.amount)||1));
  const allowed=['coins','gems','pack']; if(!/^\d{10}$/.test(toId)||!allowed.includes(type))return res.status(400).json({error:'Dữ liệu quà không hợp lệ'});
  const target=Object.values(db.users).find(x=>x.id===toId); if(!target)return res.status(404).json({error:'ID_NOT_FOUND'});
  const pack=String(req.body.pack||'quick');
  if(type==='coins'){ if(req.user.state.coins<amount)return res.status(400).json({error:'NOT_ENOUGH_COINS'}); req.user.state.coins-=amount; }
  if(type==='gems'){ if(req.user.state.gems<amount)return res.status(400).json({error:'NOT_ENOUGH_GEMS'}); req.user.state.gems-=amount; }
  target.state.mailbox.push({id:crypto.randomUUID(),type,amount,pack,title:'🎁 Quà từ '+req.user.nickname,text:type==='pack'?`Bạn nhận ${amount} ${pack} từ ${req.user.nickname}.`: `Bạn nhận ${amount} ${type==='coins'?'Coins':'Gems'} từ ${req.user.nickname}.`,createdAt:new Date().toISOString()});
  writeDb();res.json({ok:true,remaining:cleanState(req.user.state),target:{id:target.id,nickname:target.nickname}});
});
app.post('/api/mail/claim',auth,(req,res)=>{const id=String(req.body.id||'');const i=req.user.state.mailbox.findIndex(x=>x.id===id);if(i<0)return res.status(404).json({error:'MAIL_NOT_FOUND'});const m=req.user.state.mailbox[i];if(m.type==='coins')req.user.state.coins+=Number(m.amount)||0;if(m.type==='gems')req.user.state.gems+=Number(m.amount)||0;if(m.type==='pack')req.user.state.packCounts[m.pack]=(Number(req.user.state.packCounts[m.pack])||0)+(Number(m.amount)||1);req.user.state.mailbox.splice(i,1);writeDb();res.json({ok:true,user:publicUser(req.user)});});
app.get('/api/market',auth,(req,res)=>res.json({prices:db.market}));
app.post('/api/admin/grant',auth,admin,(req,res)=>{
  const target=Object.values(db.users).find(x=>x.id===String(req.body.id||'')); if(!target)return res.status(404).json({error:'ID_NOT_FOUND'});
  const type=String(req.body.type||'');const amount=Math.max(1,Math.floor(Number(req.body.amount)||1));
  if(type==='coins')target.state.mailbox.push({id:crypto.randomUUID(),type:'coins',amount,title:'💰 Quà từ Admin',text:`Admin gửi ${amount.toLocaleString('vi-VN')} Coins.`,createdAt:new Date().toISOString()});
  else if(type==='gems')target.state.mailbox.push({id:crypto.randomUUID(),type:'gems',amount,title:'💎 Quà từ Admin',text:`Admin gửi ${amount.toLocaleString('vi-VN')} Gems.`,createdAt:new Date().toISOString()});
  else if(type==='pack'){const pack=String(req.body.pack||'quick');target.state.mailbox.push({id:crypto.randomUUID(),type:'pack',pack,amount,title:'🎁 Quà từ Admin',text:`Admin gửi ${amount} ${pack}.`,createdAt:new Date().toISOString()});}
  else return res.status(400).json({error:'GRANT_TYPE_INVALID'});
  db.logs.unshift({time:new Date().toISOString(),admin:req.user.username,action:type,target:target.id,amount});db.logs=db.logs.slice(0,500);writeDb();res.json({ok:true,target:{id:target.id,nickname:target.nickname}});
});
app.post('/api/admin/price',auth,admin,(req,res)=>{const player=String(req.body.player||'');const price=Math.max(0,Math.floor(Number(req.body.price)||0));if(!player)return res.status(400).json({error:'PLAYER_REQUIRED'});db.market[player]=price;db.logs.unshift({time:new Date().toISOString(),admin:req.user.username,action:'price',player,price});db.logs=db.logs.slice(0,500);writeDb();res.json({ok:true,player,price});});
app.get('/api/admin/users',auth,admin,(req,res)=>res.json({users:Object.values(db.users).map(publicUser),logs:db.logs.slice(0,100),prices:db.market}));
app.listen(PORT,()=>console.log(`Football Legends server listening on ${PORT}`));
