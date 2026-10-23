import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chargeToken, chargeVault, refundTransaction } from './lib/nmi.mjs';
import { upsertLead, addEvent, one, many, run } from './lib/database.mjs';

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
const secureEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const adminToken=()=>crypto.createHmac('sha256',secret).update('cashtap-admin').digest('base64url');
const adminOk=req=>{const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cta_admin='));return Boolean(c)&&secureEqual(decodeURIComponent(c.slice(10)),adminToken())};
const setAdmin=res=>res.setHeader('set-cookie',`cta_admin=${encodeURIComponent(adminToken())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
const csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`;
const range=url=>{const end=new Date(url.searchParams.get('end')||Date.now()),start=new Date(url.searchParams.get('start')||end-86400000);return{start:start.toISOString(),end:end.toISOString()}};

async function api(req,res,url) {
  if(req.method==='POST'&&url.pathname==='/api/admin/login'){const input=await body(req);if(!secureEqual(input.pin,'67'))return json(res,401,{error:'Incorrect PIN'});setAdmin(res);return json(res,200,{ok:true})}
  if(url.pathname.startsWith('/api/admin/')){
    if(!adminOk(req))return json(res,401,{error:'Admin PIN required'});
    const r=range(url),q=clean(url.searchParams.get('q')).slice(0,100),page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=50,offset=(page-1)*limit;
    if(req.method==='GET'&&url.pathname==='/api/admin/report'){
      const [e,l,o,routes,devices,payments,offers,attribution,trend]=await Promise.all([
        one(`SELECT COUNT(*) FILTER(WHERE type='page_view') views,COUNT(DISTINCT metadata->>'session_id') FILTER(WHERE type='page_view') visitors,COUNT(DISTINCT metadata->>'session_id') FILTER(WHERE type='page_view' AND page='/checkout') checkout_visitors,COUNT(*) FILTER(WHERE type='checkout_start') checkout_started,COUNT(*) FILTER(WHERE type='video_unmute') video_engaged,COUNT(*) FILTER(WHERE type='video_25') video_25,COUNT(*) FILTER(WHERE type='video_50') video_50,COUNT(*) FILTER(WHERE type='video_75') video_75,COUNT(*) FILTER(WHERE type='video_100') video_100 FROM events WHERE created_at BETWEEN $1 AND $2`,[r.start,r.end]),one('SELECT COUNT(*) leads FROM leads WHERE created_at BETWEEN $1 AND $2',[r.start,r.end]),one(`SELECT COUNT(*) attempts,COUNT(*) FILTER(WHERE status='paid') approvals,COUNT(*) FILTER(WHERE status='declined') declines,COUNT(*) FILTER(WHERE status='error') errors,COUNT(DISTINCT lead_id) payment_people,COUNT(DISTINCT lead_id) FILTER(WHERE status='paid') buyers,COUNT(DISTINCT lead_id) FILTER(WHERE status='declined') declined_people,COALESCE(SUM(amount) FILTER(WHERE status='paid'),0) revenue FROM orders WHERE updated_at BETWEEN $1 AND $2`,[r.start,r.end]),
        many(`SELECT page path,COUNT(DISTINCT metadata->>'session_id')::int visitors,COUNT(*)::int views FROM events WHERE type='page_view' AND created_at BETWEEN $1 AND $2 GROUP BY page ORDER BY views DESC`,[r.start,r.end]),many(`SELECT COALESCE(metadata->>'device','Unknown') device,COUNT(DISTINCT metadata->>'session_id')::int visitors FROM events WHERE type='page_view' AND created_at BETWEEN $1 AND $2 GROUP BY 1`,[r.start,r.end]),many(`SELECT COALESCE(response_code,'—') response_code,COALESCE(response_message,'No gateway message') response,status,COUNT(*)::int attempts,COUNT(DISTINCT lead_id)::int people,COALESCE(SUM(amount),0) amount FROM orders WHERE updated_at BETWEEN $1 AND $2 GROUP BY 1,2,3 ORDER BY attempts DESC`,[r.start,r.end]),many(`SELECT product_id offer_key,product_name,COUNT(DISTINCT lead_id)::int people,COUNT(*)::int attempts,COUNT(*) FILTER(WHERE status='paid')::int approvals,COUNT(*) FILTER(WHERE status='declined')::int declines,COALESCE(SUM(amount) FILTER(WHERE status='paid'),0) revenue FROM orders WHERE updated_at BETWEEN $1 AND $2 GROUP BY 1,2`,[r.start,r.end]),many(`SELECT COALESCE(NULLIF(utm_source,''),source,'direct') source,COALESCE(NULLIF(utm_campaign,''),'—') campaign,COUNT(*)::int leads,COUNT(*) FILTER(WHERE status='customer')::int buyers FROM leads WHERE created_at BETWEEN $1 AND $2 GROUP BY 1,2`,[r.start,r.end]),many(`SELECT date_trunc('hour',created_at) bucket,COUNT(*) FILTER(WHERE type='page_view')::int views,0::int leads,0::numeric revenue FROM events WHERE created_at BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,[r.start,r.end])]);
      const n=v=>Number(v||0),s={...Object.fromEntries(Object.entries(e||{}).map(([k,v])=>[k,n(v)])),leads:n(l?.leads),...Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k,n(v)])),refunds:0};s.net_revenue=s.revenue;s.approval_rate=s.attempts?+(s.approvals/s.attempts*100).toFixed(1):0;s.conversion=s.visitors?+(s.buyers/s.visitors*100).toFixed(2):0;s.lead_conversion=s.leads?+(s.buyers/s.leads*100).toFixed(2):0;s.aov=s.buyers?s.revenue/s.buyers:0;s.rpv=s.visitors?s.revenue/s.visitors:0;s.rpl=s.leads?s.revenue/s.leads:0;return json(res,200,{range:r,summary:s,routes,devices,payments,offers,attribution,trend});
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/orders'){const params=[r.start,r.end,q],where=`o.updated_at BETWEEN $1 AND $2 AND ($3='' OR CONCAT_WS(' ',l.first_name,l.last_name) ILIKE '%'||$3||'%' OR l.email ILIKE '%'||$3||'%' OR l.phone ILIKE '%'||$3||'%')`,total=Number((await one(`SELECT COUNT(*) total FROM orders o JOIN leads l ON l.id=o.lead_id WHERE ${where}`,params)).total),items=await many(`SELECT o.*,l.first_name,l.last_name,l.email,l.phone FROM orders o JOIN leads l ON l.id=o.lead_id WHERE ${where} ORDER BY o.updated_at DESC LIMIT $4 OFFSET $5`,[...params,limit,offset]);return json(res,200,{items,pagination:{page,pageSize:limit,total,pages:Math.max(1,Math.ceil(total/limit))},range:r})}
    const sold=`SELECT l.id,l.first_name,l.last_name,l.email,l.phone,COUNT(o.id)::int purchase_count,SUM(o.amount) gross_sales,STRING_AGG(o.product_name,', ') products,MIN(o.created_at) first_purchase_at,MAX(o.updated_at) last_purchase_at,0 refund_count,0 refund_amount,SUM(o.amount) net_sales FROM leads l JOIN orders o ON o.lead_id=l.id AND o.status='paid' GROUP BY l.id`;
    if(req.method==='GET'&&url.pathname==='/api/admin/leads'){const total=Number((await one(`SELECT COUNT(*) total FROM leads WHERE $1='' OR CONCAT_WS(' ',first_name,last_name) ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%' OR phone ILIKE '%'||$1||'%'`,[q])).total),items=await many(`SELECT *,status display_status FROM leads WHERE $1='' OR CONCAT_WS(' ',first_name,last_name) ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%' OR phone ILIKE '%'||$1||'%' ORDER BY created_at DESC LIMIT $2 OFFSET $3`,[q,limit,offset]);return json(res,200,{items,pagination:{page,pageSize:limit,total,pages:Math.max(1,Math.ceil(total/limit))}})}
    if(req.method==='GET'&&url.pathname==='/api/admin/sales'){const items=await many(`${sold} ORDER BY last_purchase_at DESC LIMIT $1 OFFSET $2`,[limit,offset]),total=Number((await one(`SELECT COUNT(*) total FROM (${sold}) s`)).total);return json(res,200,{items,pagination:{page,pageSize:limit,total,pages:Math.max(1,Math.ceil(total/limit))}})}
    if(req.method==='GET'&&url.pathname==='/api/admin/dashboard')return json(res,200,{automations:await many('SELECT * FROM automations ORDER BY created_at DESC'),messages:await many('SELECT * FROM messages ORDER BY created_at DESC LIMIT 100')});
    if(req.method==='POST'&&url.pathname==='/api/admin/leads'){const input=await body(req),result=await upsertLead({...input,source:'admin'});await addEvent(result.lead.id,'opt_in',{metadata:{source:'admin'}});return json(res,201,{ok:true,id:Number(result.lead.id)})}
    if(req.method==='POST'&&url.pathname==='/api/admin/automations'){const input=await body(req);if(!['email','sms'].includes(input.channel))return json(res,400,{error:'Invalid channel'});await run(`INSERT INTO automations(name,channel,delay_minutes,subject,message,enabled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())`,[clean(input.name),input.channel,Number(input.delay_minutes)||0,clean(input.subject),clean(input.message),Boolean(input.enabled)]);return json(res,201,{ok:true})}
    if(req.method==='POST'&&url.pathname==='/api/admin/refunds'){const input=await body(req);if(!secureEqual(input.pin,'67'))return json(res,401,{error:'Incorrect confirmation PIN'});const order=await one(`SELECT * FROM orders WHERE id=$1 AND status='paid'`,[Number(input.orderId)]);if(!order?.transaction_id)return json(res,409,{error:'Only approved NMI transactions can be refunded'});const remaining=Number(order.amount)-Number(order.refunded_amount||0),amount=Math.round(Number(input.amount||remaining)*100)/100;if(!(amount>0&&amount<=remaining))return json(res,400,{error:'Invalid refund amount'});try{const result=await refundTransaction({transactionId:order.transaction_id,amount});await run(`UPDATE orders SET refunded_amount=refunded_amount+$1,refund_status=CASE WHEN refunded_amount+$1>=amount THEN 'refunded' ELSE 'partially_refunded' END,refund_updated_at=NOW() WHERE id=$2`,[amount,order.id]);await addEvent(order.lead_id,'refund',{value:amount,product_id:order.product_id,transaction_id:result.transactionId,metadata:{gateway:'nmi',original_transaction_id:order.transaction_id}});return json(res,200,{ok:true,action:'refund',amount,transactionId:result.transactionId})}catch(error){return json(res,409,{error:error.message})}}
    if(req.method==='GET'&&(url.pathname==='/api/admin/leads/export'||url.pathname==='/api/admin/sales/export')){const rows=url.pathname.includes('sales')?await many(sold):await many('SELECT * FROM leads ORDER BY created_at DESC'),keys=rows[0]?Object.keys(rows[0]):[],csv='\uFEFF'+[keys.map(csvCell).join(','),...rows.map(x=>keys.map(k=>csvCell(x[k])).join(','))].join('\r\n');res.writeHead(200,{'content-type':'text/csv','content-disposition':'attachment; filename="cashtap-export.csv"'});return res.end(csv)}
    return json(res,404,{error:'Not found'});
  }
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
    const {lead}=await upsertLead({...customer,source:'checkout',landing_page:'/checkout'});let order=(await run(`INSERT INTO orders(lead_id,product_id,product_name,amount,status,created_at,updated_at) VALUES($1,'front',$2,$3,'pending',NOW(),NOW()) ON CONFLICT(lead_id,product_id) DO UPDATE SET status='pending',updated_at=NOW() RETURNING *`,[lead.id,products.front.name,products.front.amount]))[0];
    try {
      const payment=await chargeToken({product:products.front,paymentToken:input.paymentToken,customer,invoice:invoice('front')});
      await run(`UPDATE orders SET status='paid',transaction_id=$1,response_code=$2,response_message='Approved',updated_at=NOW() WHERE id=$3`,[payment.transactionId,payment.responseCode,order.id]);await addEvent(lead.id,'sale',{value:products.front.amount,product_id:'front',transaction_id:payment.transactionId,metadata:{gateway:'nmi'}});
      setSession(res,{...customer,customerVaultId:payment.customerVaultId,initialTransactionId:payment.transactionId,purchased:['front'],createdAt:Date.now()});
      return json(res,200,{ok:true,next:products.front.next,transactionId:payment.transactionId});
    } catch(error) {await run(`UPDATE orders SET status='declined',response_code=$1,response_message=$2,updated_at=NOW() WHERE id=$3`,[error.code||'',error.message,order.id]);return json(res,402,{error:error.message,code:error.code||'declined'}); }
  }
  if(req.method==='POST' && url.pathname==='/api/purchase') {
    const input=await body(req), session=decode(req), product=products[input.product];
    if(!session) return json(res,401,{error:'Your secure checkout session expired. Please complete the initial checkout again.'});
    if(!product || input.product==='front') return json(res,400,{error:'Unknown upgrade'});
    if(session.purchased.includes(input.product)) return json(res,200,{ok:true,next:product.next,alreadyPurchased:true});
    const {lead}=await upsertLead({...session,source:'checkout'});let order=(await run(`INSERT INTO orders(lead_id,product_id,product_name,amount,status,created_at,updated_at) VALUES($1,$2,$3,$4,'pending',NOW(),NOW()) ON CONFLICT(lead_id,product_id) DO UPDATE SET status='pending',updated_at=NOW() RETURNING *`,[lead.id,input.product,product.name,product.amount]))[0];
    try {
      const payment=await chargeVault({product,customerVaultId:session.customerVaultId,initialTransactionId:session.initialTransactionId,invoice:invoice(input.product)});
      await run(`UPDATE orders SET status='paid',transaction_id=$1,response_code=$2,response_message='Approved',updated_at=NOW() WHERE id=$3`,[payment.transactionId,payment.responseCode,order.id]);await addEvent(lead.id,'sale',{value:product.amount,product_id:input.product,transaction_id:payment.transactionId,metadata:{gateway:'nmi',one_click:true}});
      setSession(res,{...session,purchased:[...session.purchased,input.product]});
      return json(res,200,{ok:true,next:product.next,transactionId:payment.transactionId});
    } catch(error) {await run(`UPDATE orders SET status='declined',response_code=$1,response_message=$2,updated_at=NOW() WHERE id=$3`,[error.code||'',error.message,order.id]);return json(res,402,{error:error.message,code:error.code||'declined'}); }
  }
  if(req.method==='POST'&&url.pathname==='/api/events'){const input=await body(req);await addEvent(null,clean(input.type)||'event',{page:clean(input.page),metadata:input});return json(res,201,{ok:true})}
  if(req.method==='POST'&&url.pathname==='/api/leads'){const input=await body(req),result=await upsertLead(input);await addEvent(result.lead.id,'opt_in',{page:input.landing_page,metadata:input});return json(res,201,{ok:true,id:Number(result.lead.id)})}
  return json(res,404,{error:'Not found'});
}

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
async function staticFile(req,res,url) {
  let rel=decodeURIComponent(url.pathname);
  if(rel==='/admin'||rel==='/admin/') rel=adminOk(req)?'/public/admin.html':'/public/admin-login.html';
  if(rel==='/') rel='/fe-e/index.html';
  else if(rel==='/checkout'||rel==='/checkout/') rel='/public/checkout.html';
  else if(rel.startsWith('/assets/')) rel='/public/'+rel.slice(8);
  else if(!path.extname(rel)) rel=rel.replace(/\/$/,'')+'/index.html';
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root)) return json(res,403,{error:'Forbidden'});
  try { const info=await stat(file); if(!info.isFile()) throw Error(); if(path.extname(file)==='.html'){let html=await readFile(file,'utf8');if(!html.includes('/assets/tracker.js'))html=html.replace(/<\/body>/i,'<script src="/assets/tracker.js" defer></script></body>');res.writeHead(200,{'content-type':types['.html'],'cache-control':'no-cache'});return res.end(html)}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'public, max-age=60'}); createReadStream(file).pipe(res); }
  catch { json(res,404,{error:'Not found'}); }
}

export async function handler(req,res) {
  try { let url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const rewritten=url.searchParams.get('__path'); if(rewritten){const original=url;url=new URL('/'+rewritten.replace(/^\//,''),url);for(const [key,value] of original.searchParams)if(key!=='__path')url.searchParams.append(key,value)} if(url.pathname.startsWith('/api/')) await api(req,res,url); else await staticFile(req,res,url); }
  catch(error) { console.error(error); json(res,500,{error:'Server error'}); }
}

export default handler;

if(!process.env.VERCEL) http.createServer(handler).listen(port,()=>console.log(`CashTap AI running at http://localhost:${port}`));
