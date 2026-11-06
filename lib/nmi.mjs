const endpoint = () => process.env.NMI_ENV === 'sandbox'
  ? 'https://sandbox.nmi.com/api/transact.php'
  : 'https://secure.nmi.com/api/transact.php';
const queryEndpoint = () => 'https://secure.nmi.com/api/query.php';
const queryStamp=value=>new Date(value).toISOString().replace(/\D/g,'').slice(0,14);
const xmlValue=(xml,tag)=>(xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1]||'').trim();
const actionDate=value=>/^\d{14}$/.test(value)?new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}Z`).toISOString():new Date(value).toISOString();

async function request(fields) {
  if (!process.env.NMI_PRIVATE_KEY) throw new Error('NMI is not configured');
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ security_key: process.env.NMI_PRIVATE_KEY, ...fields })
  });
  const data = Object.fromEntries(new URLSearchParams(await response.text()));
  if (!response.ok || data.response !== '1') {
    const error = new Error(data.responsetext || `Gateway HTTP ${response.status}`);
    error.code = data.response_code || data.response || 'declined';
    error.transactionId = data.transactionid || '';
    throw error;
  }
  return {
    transactionId: data.transactionid || '',
    customerVaultId: data.customer_vault_id || '',
    responseCode: data.response_code || data.response,
    responseText: data.responsetext || 'Approved'
  };
}

const common = ({ product, invoice }) => ({
  type: 'sale',
  amount: product.amount.toFixed(2),
  currency: 'USD',
  orderid: String(invoice).slice(0, 30),
  order_description: product.name.slice(0, 255)
});

export function chargeToken({ product, paymentToken, customer, invoice }) {
  return request({
    ...common({ product, invoice }),
    payment_token: paymentToken,
    customer_vault: 'add_customer',
    firstname: customer.first_name,
    lastname: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    address1: customer.address,
    city: customer.city,
    state: customer.state,
    zip: customer.zip,
    country: 'US'
  });
}

export function chargeVault({ product, customerVaultId, initialTransactionId, invoice }) {
  return request({
    ...common({ product, invoice }),
    customer_vault_id: String(customerVaultId),
    initiated_by: 'customer',
    stored_credential_indicator: 'used',
    initial_transaction_id: String(initialTransactionId || '')
  });
}

export function refundTransaction({ transactionId, amount }) {
  return request({ type:'refund', transactionid:String(transactionId), amount:Number(amount).toFixed(2) });
}

export function parseReturnTransactions(xml){
  const returns=[];
  for(const transaction of xml.matchAll(/<transaction>([\s\S]*?)<\/transaction>/g)){
    const body=transaction[1],transactionId=xmlValue(body,'transaction_id'),originalTransactionId=xmlValue(body,'original_transaction_id');
    for(const action of body.matchAll(/<action>([\s\S]*?)<\/action>/g)){
      const type=xmlValue(action[1],'action_type').toLowerCase(),success=xmlValue(action[1],'success');
      if(!['refund','void'].includes(type)||success!=='1')continue;
      returns.push({transactionId,originalTransactionId:originalTransactionId||transactionId,action:type,amount:Math.abs(Number(xmlValue(action[1],'amount')||0)),submittedAt:actionDate(xmlValue(action[1],'date'))});
    }
  }
  return returns;
}

export async function getNmiReturnTransactions(startDate,endDate=new Date()){
  if(!process.env.NMI_PRIVATE_KEY)throw new Error('NMI is not configured');
  const all=[];
  const fetchPage=async page=>{
    const response=await fetch(queryEndpoint(),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({security_key:process.env.NMI_PRIVATE_KEY,report_type:'transaction',start_date:queryStamp(startDate),end_date:queryStamp(endDate),result_limit:'1000',page_number:String(page)}),signal:AbortSignal.timeout(30000)});
    const xml=await response.text();
    if(!response.ok||/<error_response>/.test(xml))throw new Error(xmlValue(xml,'error')||`NMI query HTTP ${response.status}`);
    return {recordCount:[...xml.matchAll(/<transaction>/g)].length,returns:parseReturnTransactions(xml)};
  };
  const first=await fetchPage(0);all.push(...first.returns);
  if(first.recordCount===1000){
    for(let page=1;page<100;page+=3){
      const pages=await Promise.all([page,page+1,page+2].map(fetchPage));
      for(const result of pages)all.push(...result.returns);
      if(pages.some(result=>result.recordCount<1000))break;
    }
  }
  return [...new Map(all.map(item=>[item.transactionId,item])).values()];
}
