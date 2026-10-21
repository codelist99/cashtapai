(() => {
  const byId=id=>document.getElementById(id), form=byId('paymentForm'), button=byId('checkoutButton'), errorBox=byId('paymentError');
  const query=new URLSearchParams(location.search);
  let processing=false;
  const fail=message=>{processing=false;errorBox.textContent=message;button.disabled=false;button.textContent='COMPLETE SECURE ORDER — $17.00'};
  async function pay(response){
    if(processing)return; processing=true; errorBox.textContent=''; button.disabled=true; button.textContent='SECURELY PROCESSING…';
    try{
      const payload={paymentToken:response.token,consent:byId('consent').checked,first_name:byId('firstName').value,last_name:byId('lastName').value,email:byId('email').value,phone:byId('phone').value,address:byId('address').value,city:byId('city').value,state:byId('state').value,zip:byId('zip').value};
      const result=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),data=await result.json();
      if(!result.ok)throw new Error(data.error||'Payment could not be completed');
      location.href=query.toString()?`${data.next}?${query}`:data.next;
    }catch(error){fail(error.message)}
  }
  fetch('/api/checkout/config').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Checkout unavailable');return data}).then(config=>{
    if(!config.publicKey)throw new Error('Secure checkout is not configured');
    const script=document.createElement('script');script.src='https://secure.nmi.com/token/Collect.js';script.dataset.tokenizationKey=config.publicKey;
    script.onload=()=>{CollectJS.configure({variant:'inline',paymentSelector:'#checkoutButton',fields:{ccnumber:{selector:'#cardNumber',title:'Card Number',placeholder:'Card number'},ccexp:{selector:'#cardExpiration',title:'Expiration',placeholder:'MM / YY'},cvv:{selector:'#cardCvv',title:'CVV',placeholder:'CVV'}},styleSniffer:'false',customCss:{display:'block',width:'100%',height:'46px',border:'0',padding:'0 12px','font-size':'16px','font-family':'Arial','box-sizing':'border-box',outline:'none'},callback:pay});button.disabled=false;button.textContent='COMPLETE SECURE ORDER — $17.00'};
    script.onerror=()=>fail('Secure payment fields could not load. Refresh and try again.');document.head.appendChild(script);
  }).catch(error=>fail(error.message));
  button.addEventListener('click',event=>{if(!form.reportValidity()){event.preventDefault();event.stopImmediatePropagation()}},true);
})();
