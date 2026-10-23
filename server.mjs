import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chargeToken, chargeVault } from './lib/nmi.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const owner = 'e9cd97bc-7bc8-4a23-bb2f-224a56a84d6b';
const secret = process.env.SESSION_SECRET || process.env.NMI_PRIVATE_KEY || 'configure-session-secret';
const products = Object.freeze({
  front: { name:'CashTap AI', amount:17, next:'/oto1-e' },
  oto1: { name:'CashTap AI DFY', amount:197, next:'/oto2-e' },
  oto1_discount: { name:'CashTap AI DFY - Special Offer', amount:97, next:'/oto2-e' },
  oto2: { name:'Automated Profits', amount:97, next:'/oto3-e' },
  oto2_discount: { name:'Automated Profits - Special Offer', amount:47, next:'/oto3-e' },
  oto3: { name:'Instant Income', amount:67, next:'/oto4-e' },
  oto3_discount: { name:'Instant Income - Special Offer', amount:37, next:'/oto4-e' },
  oto4: { name:'Cyber Protection', amount:127, next:'/oto5-e' },
  oto4_discount: { name:'Cyber Protection - Special Offer', amount:97, next:'/oto5-e' },
  oto5: { name:'Autopilot Earnings', amount:147, next:'/oto6-e' },
  oto5_discount: { name:'Autopilot Earnings - Special Offer', amount:47, next:'/oto6-e' },
  oto6: { name:'High-Ticket Payout', amount:97, next:'/oto7-e' },
  oto6_discount: { name:'High-Ticket Payout - Special Offer', amount:47, next:'/oto7-e' },
  oto7: { name:'Full Turnkey Reseller & License Rights Edition', amount:167, next:'/thankyou-e' },
  oto7_discount: { name:'Full Turnkey Reseller & License Rights Edition - Special Offer', amount:67, next:'/thankyou-e' }
});

const clean = value => String(value ?? '').trim();
const json = (res, status, payload) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(payload)); };
const body = async req => { let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>1e6) throw Error('Payload too large'); } return raw ? JSON.parse(raw) : {}; };
const sign = value => crypto.createHmac('sha256', secret).update(value).digest('base64url');
const encode = data => { const value=Buffer.from(JSON.stringify(data)).toString('base64url'); return `${value}.${sign(value)}`; };
const decode = req => {
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cta_session='))?.slice(12);
  if(!raw) return null;
  const split=raw.lastIndexOf('.'); if(split<1) return null;
  const value=raw.slice(0,split), supplied=raw.slice(split+1), expected=sign(value);
  if(supplied.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return null;
  try { const data=JSON.parse(Buffer.from(value,'base64url').toString()); return Date.now()-data.createdAt<86400000 ? data : null; } catch { return null; }
};
const setSession = (res,data) => res.setHeader('set-cookie',`cta_session=${encode(data)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
const invoice = product => `CTA-${product}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

async function api(req,res,url) {
  if(req.method==='GET' && url.pathname==='/api/checkout/config') return json(res,200,{gateway:'nmi',publicKey:process.env.NMI_PUBLIC_KEY||'',product:{name:products.front.name,amount:products.front.amount}});
  if(req.method==='GET' && url.pathname.startsWith('/api/player/')) {
    const player=url.pathname.match(/^\/api\/player\/([a-z0-9]+)\.js$/)?.[1];
    if(!player) return json(res,404,{error:'Not found'});
    const remote=`https://scripts.converteai.net/${owner}/players/${player}/v4/player.js`;
    const response=await fetch(remote); if(!response.ok) return json(res,response.status,{error:'Player unavailable'});
    const script=(await response.text()).replaceAll('https://explodely.com/p/464145644','/checkout');
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300'}); return res.end(script);
  }
  if(req.method==='POST' && url.pathname==='/api/checkout') {
    const input=await body(req);
    if(!input.consent) return json(res,400,{error:'Payment authorization is required'});
    if(!input.paymentToken) return json(res,400,{error:'Secure card token is required'});
    const customer={first_name:clean(input.first_name),last_name:clean(input.last_name),email:clean(input.email),phone:clean(input.phone),address:clean(input.address),city:clean(input.city),state:clean(input.state),zip:clean(input.zip)};
    if(!customer.first_name||!customer.last_name||!customer.email||!customer.phone||!customer.address||!customer.city||!customer.state||!customer.zip) return json(res,400,{error:'Complete all contact and billing fields'});
    try {
      const payment=await chargeToken({product:products.front,paymentToken:input.paymentToken,customer,invoice:invoice('front')});
      setSession(res,{...customer,customerVaultId:payment.customerVaultId,initialTransactionId:payment.transactionId,purchased:['front'],createdAt:Date.now()});
      return json(res,200,{ok:true,next:products.front.next,transactionId:payment.transactionId});
    } catch(error) { return json(res,402,{error:error.message,code:error.code||'declined'}); }
  }
  if(req.method==='POST' && url.pathname==='/api/purchase') {
    const input=await body(req), session=decode(req), product=products[input.product];
    if(!session) return json(res,401,{error:'Your secure checkout session expired. Please complete the initial checkout again.'});
    if(!product || input.product==='front') return json(res,400,{error:'Unknown upgrade'});
    if(session.purchased.includes(input.product)) return json(res,200,{ok:true,next:product.next,alreadyPurchased:true});
    try {
      const payment=await chargeVault({product,customerVaultId:session.customerVaultId,initialTransactionId:session.initialTransactionId,invoice:invoice(input.product)});
      setSession(res,{...session,purchased:[...session.purchased,input.product]});
      return json(res,200,{ok:true,next:product.next,transactionId:payment.transactionId});
    } catch(error) { return json(res,402,{error:error.message,code:error.code||'declined'}); }
  }
  return json(res,404,{error:'Not found'});
}

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
async function staticFile(req,res,url) {
  let rel=decodeURIComponent(url.pathname);
  if(rel==='/') rel='/fe-e/index.html';
  else if(rel==='/checkout'||rel==='/checkout/') rel='/public/checkout.html';
  else if(rel.startsWith('/assets/')) rel='/public/'+rel.slice(8);
  else if(!path.extname(rel)) rel=rel.replace(/\/$/,'')+'/index.html';
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root)) return json(res,403,{error:'Forbidden'});
  try { const info=await stat(file); if(!info.isFile()) throw Error(); res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'public, max-age=60'}); createReadStream(file).pipe(res); }
  catch { json(res,404,{error:'Not found'}); }
}

export async function handler(req,res) {
  try { let url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const rewritten=url.searchParams.get('__path'); if(rewritten) url=new URL('/'+rewritten.replace(/^\//,''),url); if(url.pathname.startsWith('/api/')) await api(req,res,url); else await staticFile(req,res,url); }
  catch(error) { console.error(error); json(res,500,{error:'Server error'}); }
}

export default handler;

if(!process.env.VERCEL) http.createServer(handler).listen(port,()=>console.log(`CashTap AI running at http://localhost:${port}`));
