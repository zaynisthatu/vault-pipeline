import fs from 'fs';
const obj = JSON.parse(fs.readFileSync('@__s_0_u_1___no_caption_7506259626237676822/@_.s.0.u.1.__no_caption_RAW-meta_2025-05-19_7506259626237676822.json', 'utf-8'));

let imgs = new Set();
function extractImages(node) {
  if (Array.isArray(node)) {
    node.forEach(extractImages);
  } else if (node && typeof node === 'object') {
    if (node.urlList && Array.isArray(node.urlList) && node.urlList.length > 0) {
      if(node.urlList[0].includes('jpeg') || node.urlList[0].includes('jpg') || node.urlList[0].includes('webp')) {
         imgs.add(node.urlList[0]);
      }
    }
    Object.values(node).forEach(extractImages);
  }
}
extractImages(obj);
console.log(Array.from(imgs));
