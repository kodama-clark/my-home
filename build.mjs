import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const script=readFileSync('src/core.mjs','utf8').replace(/^export /gm,'')+'\n'+readFileSync('src/app.js','utf8');
if(/<\/script/i.test(script))throw Error('Unexpected script closing tag');
const hash="'sha256-"+createHash('sha256').update(script).digest('base64')+"'";
const html=readFileSync('src/template.html','utf8').replace('__STYLE__',()=>readFileSync('src/style.css','utf8')).replace('__SCRIPT_HASH__',()=>hash).replace('__SCRIPT__',()=>script);
writeFileSync('index.html',html);
console.log('Built index.html:',Buffer.byteLength(html),'bytes');
