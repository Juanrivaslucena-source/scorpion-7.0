import sharp from 'sharp';
const src='./realbikes', out='./public/real';
const map={ 'ultrabee.webp':'ultrabee.jpg', 'talaria.jpg':'talaria.jpg', 'stormbee.jpg':'stormbee.jpg' };
for (const [s,d] of Object.entries(map)){
  await sharp(`${src}/${s}`).resize({width:1400,withoutEnlargement:true}).jpeg({quality:92}).toFile(`${out}/${d}`);
  console.log('ok', d);
}
