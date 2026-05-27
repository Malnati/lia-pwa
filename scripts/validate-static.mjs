import { readFileSync } from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');
for (const text of ['aneety.com', 'api.aneety.com', '<main']) {
  if (!html.includes(text)) {
    throw new Error(`Missing required static marker: ${text}`);
  }
}
console.log('static page ok');
