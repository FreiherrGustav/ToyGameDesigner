import math, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
CELL=6; INK=(26,16,32)
TONES={'y':dict(hi=(255,240,130),base=(255,210,31),sh=(245,160,10),deep=(214,110,8)),
       't':dict(hi=(130,238,234),base=(24,198,198),sh=(14,150,165),deep=(10,110,128))}
FONT='fonts/LilitaOne-Regular.ttf'; TEXT='ThingamaBox'; SPLIT=8   # first 8 letters yellow
import os
WIDTH_CELLS=int(os.environ.get('WM_W','300')); OUT=os.environ.get('WM_OUT','wordmark_arc'); TRACK=float(os.environ.get('WM_TRACK','0.04')); GAP=float(os.environ.get('WM_GAP','0.10')); ARC=0.034; PEAK=0.18; JIT_Y=0.035; JIT_ROT=2.6; JIT_SIZE=0.035; EXT=5; SHADOW=(8,5)               # extrusion depth, drop-shadow offset (down,right) in cells
def shifted(m,dy,dx):
    o=np.zeros_like(m); H,W=m.shape
    ys=slice(max(dy,0),H+min(dy,0)); yd=slice(max(-dy,0),H+min(-dy,0)); xs=slice(max(dx,0),W+min(dx,0)); xd=slice(max(-dx,0),W+min(-dx,0))
    o[ys,xs]=m[yd,xd]; return o
f0=ImageFont.truetype(FONT,200); L0=sum(f0.getlength(c)+200*0.04 for c in TEXT)
size=int(200*WIDTH_CELLS*CELL/L0); f=ImageFont.truetype(FONT,size)
MIX=[0.04,0.04,0.04,0.04,0.0,-0.035,-0.035,0.04,0.04,0.04,0.0]   # T-h h-i i-n n-g | g-a | a-m m-a | a-B | B-o o-x  (Thing/current, ama/tight, Box/current, joins/snug)
adv=[f.getlength(c)+size*(MIX[i] if os.environ.get('WM_MIX') else TRACK+(GAP if i==SPLIT-1 else 0)) for i,c in enumerate(TEXT)]; L=sum(adv)
PADPX=int(size*0.9); Wpx=int(L)+2*PADPX; Hpx=int(size*2.6)
cx0=PADPX; base_y=int(size*1.5)
letters=[]
import random
rng=random.Random(7)
def arc_y(u):                       # asymmetric hump: peak sits a little right of centre, falls off unevenly
    t=(u-PEAK)/(1+abs(PEAK)); return -ARC*L*(1-t*t)
x=0
for i,ch in enumerate(TEXT):
    xc=cx0+x+adv[i]/2; u=(x+adv[i]/2-L/2)/(L/2); du=0.01
    slope=(arc_y(u+du)-arc_y(u-du))/(du*L/2*2)          # dy/dx of the baseline
    yb=base_y+arc_y(u)+rng.uniform(-JIT_Y,JIT_Y)*size
    ang=-math.degrees(math.atan(slope))+rng.uniform(-JIT_ROT,JIT_ROT)
    sc=1+rng.uniform(-JIT_SIZE,JIT_SIZE)
    fs=ImageFont.truetype(FONT,int(size*sc))
    g=Image.new('L',(size*2,size*2),0); d=ImageDraw.Draw(g)
    d.text((size-adv[i]/2,size),ch,font=fs,fill=255,anchor='ls')
    g=g.rotate(ang,resample=Image.BICUBIC,center=(size,size))
    tmp=Image.new('L',(Wpx,Hpx),0); tmp.paste(g,(int(xc-size),int(yb-size))); letters.append(tmp)
    x+=adv[i]
def grid(im):
    a=np.array(im).astype(float); gh,gw=Hpx//CELL,Wpx//CELL
    return a[:gh*CELL,:gw*CELL].reshape(gh,CELL,gw,CELL).mean(axis=(1,3))>110
masks=[grid(t) for t in letters]
F=np.zeros_like(masks[0])
for m in masks: F|=m
ys,xs=np.where(F); sl=(slice(ys.min(),ys.max()+1),slice(xs.min(),xs.max()+1))
P=EXT+SHADOW[0]+6
masks=[np.pad(m[sl],((P,P),(P,P))) for m in masks]; F=np.pad(F[sl],((P,P),(P,P)))
H,W=F.shape; out=np.zeros((H,W,4),np.uint8)
def body_of(m):
    ext=np.zeros_like(m)
    for k in range(1,EXT+1): ext|=shifted(m,k,k//2)
    ext&=~m; solid=m|ext
    ring=ndi.binary_dilation(solid,structure=np.ones((3,3)),iterations=2)&~solid
    return ext,solid,ring
# one soft drop shadow under everything
allbody=np.zeros_like(F)
for m in masks: allbody|=body_of(m)[1]|body_of(m)[2]
shadow=np.zeros_like(F)
for k in range(1,SHADOW[0]+1): shadow|=shifted(allbody,k,round(k*SHADOW[1]/SHADOW[0]))
shadow&=~allbody
out[shadow]=(26,16,32,95)
for i,m in enumerate(masks):                      # each letter drawn whole, left to right, so a later letter overlaps the earlier one
    T=TONES['y' if i<SPLIT else 't']; ext,solid,ring=body_of(m)
    lay=np.zeros((H,W,4),np.uint8)
    lay[ring]=INK+(255,); lay[ext,:3]=T['deep']; lay[ext,3]=255
    lay[m,:3]=T['base']; lay[m,3]=255
    tl=np.zeros_like(m)
    for k in (1,2): tl|=(~shifted(m,k,0))|(~shifted(m,0,k))
    tl&=m; br=shifted(~m,-1,0)&m
    lay[m&tl,:3]=T['hi']; lay[m&br,:3]=T['sh']; lay[m&tl&br,:3]=T['sh']
    vis=lay[...,3]>0; out[vis]=lay[vis]
ys,xs=np.where(out[...,3]>0); out=out[ys.min():ys.max()+1,xs.min():xs.max()+1]
im=Image.fromarray(out,'RGBA'); im.save(OUT+'_1x.png')
big=im.resize((im.width*CELL,im.height*CELL),Image.NEAREST); big.save(OUT+'.png')
for n,bg in (('dark',(32,34,58,255)),('light',(255,255,255,255)),('box',(240,140,22,255))):
    c=Image.new('RGBA',big.size,bg); c.alpha_composite(big); c.save(f'{OUT}_preview_{n}.png')
print(big.size)
