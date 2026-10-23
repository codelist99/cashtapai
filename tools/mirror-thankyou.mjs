import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const source = 'https://wificode.dev/thankyou';
const response = await fetch(source);
if (!response.ok) throw new Error(`Thank-you page: HTTP ${response.status}`);

const html = (await response.text())
  .replaceAll('(206) 703-2153', '(828) 257-1162')
  .replaceAll('tel:+12067032153', 'tel:+18282571162');

const directory = path.resolve(import.meta.dirname, '..', 'thankyou-e');
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, 'index.html'), html);
console.log('Mirrored WiFi Code thank-you page with CashTap call-in number.');
