import sharp from 'sharp';
const U = '/root/.claude/uploads/a7bc2945-f1e1-5c42-be20-e98c836829ba';
const OUT = './public/photos';
const map = {
  '01': '37f67d25-IMG_5758.png',
  '02': 'b5eb074b-IMG_5755.png',
  '03': 'de6d2421-IMG_5756.png',
  '04': 'c7533af0-IMG_5757.png',
};
for (const [k, f] of Object.entries(map)) {
  await sharp(`${U}/${f}`)
    .extract({ left: 0, top: 300, width: 1150, height: 2100 })
    .jpeg({ quality: 90 })
    .toFile(`${OUT}/${k}.jpg`);
  console.log('wrote', k);
}
