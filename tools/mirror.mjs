import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const routes = ['fe-e','oto1-e','oto2-e','oto3-e','oto4-e','oto5-e','oto6-e','oto7-e','thankyou-e'];

for (const route of routes) {
  const response = await fetch(`https://getcastapai.com/${route}?affid=digitaltrilogy`);
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  let html = await response.text();
  html = html
    .replaceAll('https://getcastapai.com/', '/')
    .replaceAll('https:\\u002F\\u002Fgetcastapai.com\\u002F', '\\u002F')
    .replaceAll('https://scripts.converteai.net/e9cd97bc-7bc8-4a23-bb2f-224a56a84d6b/players/6a267296844dd526329c9ba8/v4/player.js', '/api/player/6a267296844dd526329c9ba8.js')
    .replaceAll('https:\\u002F\\u002Fscripts.converteai.net\\u002Fe9cd97bc-7bc8-4a23-bb2f-224a56a84d6b\\u002Fplayers\\u002F6a267296844dd526329c9ba8\\u002Fv4\\u002Fplayer.js', '\\u002Fapi\\u002Fplayer\\u002F6a267296844dd526329c9ba8.js')
    .replace(/<\/body>/i, '<script src="/assets/funnel.js" defer></script></body>');
  const directory = path.join(root, route);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html);
  console.log(`Mirrored /${route}`);
}
