import sharp from 'sharp';
const U='/root/.claude/uploads/a7bc2945-f1e1-5c42-be20-e98c836829ba';
const seq = [
  ['98d8f6c4','01'], // Sur-Ron Ultra Bee (dirt)
  ['77b95242','02'], // 79Bike Falcon (road sunset)
  ['abdf156c','03'], // Arctic Leopard (desert)
  ['d5fd75c9','04'], // Yozma IN10 Pro (night)
  ['ad47b7f8','05'], // Altis (studio)
  ['c87026f5','06'], // black camo (garage)
  ['a6bd076b','07'], // black (foam)
  ['9a40b78c','08'], // white (mountains)
];
for (const [h,n] of seq){
  await sharp(`${U}/${h}-FullSizeRender.jpeg`).resize({width:1440,withoutEnlargement:true}).jpeg({quality:90}).toFile(`./public/brands/${n}.jpg`);
  console.log('ok',n);
}
