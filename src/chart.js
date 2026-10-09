// Small first-party PNG bar chart. No chart service receives financial data.
const enc=new TextEncoder();
function u32(n){return new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);}
function concat(...parts){const o=new Uint8Array(parts.reduce((s,x)=>s+x.length,0));let offset=0;for(const p of parts){o.set(p,offset);offset+=p.length;}return o;}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=(c>>>8)^crcTable[(c^b)&255];return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=enc.encode(type);return concat(u32(data.length),t,data,u32(crc32(concat(t,data))));}
export async function barPNG(values) {
  const w=360,h=180,raw=new Uint8Array((w*3+1)*h);raw.fill(255);
  for(let y=0;y<h;y++)raw[y*(w*3+1)]=0;
  const colors=[[34,160,110],[228,94,70]],max=Math.max(1,...values);
  for(let i=0;i<2;i++){
    const height=Math.round(Math.max(0,values[i]||0)/max*135);
    for(let y=155-height;y<155;y++)for(let x=70+i*160;x<130+i*160;x++)for(let c=0;c<3;c++)raw[y*(w*3+1)+1+x*3+c]=colors[i][c];
  }
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return concat(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',concat(u32(w),u32(h),new Uint8Array([8,2,0,0,0]))),chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
}
