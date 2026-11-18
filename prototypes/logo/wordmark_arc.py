import math, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
CELL=6; INK=(26,16,32)
TONES={'y':dict(hi=(255,240,130),base=(255,210,31),sh=(245,160,10),deep=(214,110,8)),
       't':dict(hi=(130,238,234),base=(24,198,198),sh=(14,150,165),deep=(10,110,128))}
FONT='fonts/LilitaOne-Regular.ttf'; TEXT='ThingamaBox'; SPLIT=8   # first 8 letters yellow
WIDTH_CELLS=300; ARC=0.055; EXT=5; SHADOW=(8,5)               # extrusion depth, drop-shadow offset (down,right) in cells
def shifted(m,dy,dx):
    o=np.zeros_like(m); H,W=m.shape
    ys=slice(max(dy,0),H+min(dy,0)); yd=slice(max(-dy,0),H+min(-dy,0)); xs=slice(max(dx,0),W+min(dx,0)); xd=slice(max(-dx,0),W+min(-dx,0))
    o[ys,xs]=m[yd,xd]; return o
f0=ImageFont.truetype(FONT,200); L0=sum(f0.getlength(c)+200*0.04 for c in TEXT)
size=int(200*WIDTH_CELLS*CELL/L0); f=ImageFont.truetype(FONT,size)
adv=[f.getlength(c)+size*(0.04+(0.10 if i==SPLIT-1 else 0)) for i,c in enumerate(TEXT)]; L=sum(adv)
PADPX=int(size*0.9); Wpx=int(L)+2*PADPX; Hpx=int(size*2.6)
cx0=PADPX; base_y=int(size*1.5)
layers={'y':Image.new('L',(Wpx,Hpx),0),'t':Image.new('L',(Wpx,Hpx),0)}
x=0
for i,ch in enumerate(TEXT):
    xc=cx0+x+adv[i]/2; u=(x+adv[i]/2-L/2)/(L/2)
    yb=base_y-ARC*L*(1-u*u); ang=-math.degrees(math.atan(4*ARC*u*(1)/1.0*0.5*0+ (2*ARC*L*u)/(L/2)*0.5)) if False else -math.degrees(math.atan((2*ARC*L*u)/(L/2)))
    g=Image.new('L',(size*2,size*2),0); d=ImageDraw.Draw(g)
    d.text((size-adv[i]/2,size),ch,font=f,fill=255,anchor='ls')
    g=g.rotate(ang,resample=Image.BICUBIC,center=(size,size))
    lay=layers['y' if i<SPLIT else 't']
    tmp=Image.new('L',(Wpx,Hpx),0); tmp.paste(g,(int(xc-size),int(yb-size)))
    lay.paste(Image.new('L',(Wpx,Hpx),255),(0,0),tmp)
    x+=adv[i]
def grid(im):
    a=np.array(im).astype(float); gh,gw=Hpx//CELL,Wpx//CELL
    return a[:gh*CELL,:gw*CELL].reshape(gh,CELL,gw,CELL).mean(axis=(1,3))>110
A,B=grid(layers['y']),grid(layers['t']); F=A|B
ys,xs=np.where(F); A,B,F=[m[ys.min():ys.max()+1,xs.min():xs.max()+1] for m in (A,B,F)]
P=EXT+SHADOW[0]+6
A,B,F=[np.pad(m,((P,P),(P,P))) for m in (A,B,F)]
ext=np.zeros_like(F)
for k in range(1,EXT+1): ext|=shifted(F,k,k//2)
ext&=~F; solid=F|ext
ring=ndi.binary_dilation(solid,structure=np.ones((3,3)),iterations=2)&~solid
body=solid|ring
shadow=np.zeros_like(F)
for k in range(1,SHADOW[0]+1): shadow|=shifted(body,k,round(k*SHADOW[1]/SHADOW[0]))
shadow&=~body
H,W=F.shape; out=np.zeros((H,W,4),np.uint8)
out[shadow]=(26,16,32,95)
out[ring]=INK+(255,)
tl=np.zeros_like(F); br=shifted(~F,-1,0)&F
for k in (1,2): tl|=(~shifted(F,k,0))|(~shifted(F,0,k))
tl&=F
for m,fam in ((A,'y'),(B,'t')):
    T=TONES[fam]; near=ndi.binary_dilation(m,iterations=EXT+1)
    e=ext&near; out[e,:3]=T['deep']; out[e,3]=255
    out[m,:3]=T['base']; out[m,3]=255
    out[m&tl,:3]=T['hi']; out[m&br,:3]=T['sh']; out[m&tl&br,:3]=T['sh']
ys,xs=np.where(out[...,3]>0); out=out[ys.min():ys.max()+1,xs.min():xs.max()+1]
im=Image.fromarray(out,'RGBA'); im.save('wordmark_arc_1x.png')
big=im.resize((im.width*CELL,im.height*CELL),Image.NEAREST); big.save('wordmark_arc.png')
for n,bg in (('dark',(32,34,58,255)),('light',(255,255,255,255)),('box',(240,140,22,255))):
    c=Image.new('RGBA',big.size,bg); c.alpha_composite(big); c.save(f'wordmark_arc_preview_{n}.png')
print(big.size)
