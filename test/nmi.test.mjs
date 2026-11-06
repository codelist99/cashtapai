import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReturnTransactions } from '../lib/nmi.mjs';

test('parses successful NMI refunds using the refund occurrence date',()=>{
  const xml='<nm_response><transaction><transaction_id>refund-1</transaction_id><original_transaction_id>sale-1</original_transaction_id><actions><action><amount>-47.00</amount><action_type>refund</action_type><date>20261106191531</date><success>1</success></action></actions></transaction></nm_response>';
  assert.deepEqual(parseReturnTransactions(xml),[{transactionId:'refund-1',originalTransactionId:'sale-1',action:'refund',amount:47,submittedAt:'2026-11-06T19:15:31.000Z'}]);
});

test('ignores failed NMI return actions',()=>{
  const xml='<transaction><transaction_id>refund-2</transaction_id><original_transaction_id>sale-2</original_transaction_id><action><amount>-17</amount><action_type>refund</action_type><date>20261106191531</date><success>0</success></action></transaction>';
  assert.deepEqual(parseReturnTransactions(xml),[]);
});
