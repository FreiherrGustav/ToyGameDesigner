"""Fit-matched lettering: puts Lilita One letters where the AI model logo has its letters (position, tilt, size, overlap),
then places them on the wordless box. Inputs: letter_fit.json (from the model), box2_1x.png + box2_offset.json (snapped box)."""
import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
CELL=6; INK=(26,16,32); FONT='fonts/LilitaOne-Regular.ttf'; FS=200
EXT=4; SHADOW=(8,5); SPLIT=8
TONES={'y':dict(hi=(255,240,130),base=(255,210,31),sh=(245,160,10),deep=(214,110,8)),
       't':dict(hi=(130,238,234),base=(24,198,198),sh=(14,150,165),deep=(10,110,128))}
fit=json.load(open('letter_fit.json')); off=json.load(open('box2_offset.json')); box=Image.open('box2_1x.png')
# model image -> wordless image registration (box body edges / top / bottom measured on both)
KX=(1693-319)/(1685-344); KY=(1474-35)/(1458-46); K=(KX+KY)/2
def to_w(x,y): return (x-319)/KX+344, (y-35)/KY+46
f=ImageFont.truetype(FONT,FS)
def glyph(ch):
    im=Image.new('L',(FS*2,FS*2),0); ImageDraw.Draw(im).text((FS//2,FS),ch,font=f,fill=255,anchor='ls'); a=np.array(im)>110
    ys,xs=np.where(a); return a[ys.min():ys.max()+1,xs.min():xs.max()+1].astype(float)
def place(G,s,th,cx,cy,shape,asp):
    gy,gx=ndi.center_of_mass(G); c,sn=math.cos(-th),math.sin(-th)
    M=np.array([[c,-sn],[sn,c]])@np.diag([1/(s/asp**0.5),1/(s*asp**0.5)]); off_=np.array([gy,gx])-M@np.array([cy,cx])
    return ndi.affine_transform(G,M,offset=off_,output_shape=shape,order=1)
letters=[]
for r in fit:
    x,y=to_w(r['cx'],r['cy']); letters.append(dict(ch=r['ch'],s=r['s']/K,asp=r['asp'],th=r['th'],cx=x,cy=y))
# canvas on the box's lattice, big enough for text + outline + shadow
xs=[l['cx'] for l in letters]; ys=[l['cy'] for l in letters]
minx,maxx=min(xs)-260,max(xs)+260; miny,maxy=min(ys)-300,max(ys)+300
i0=math.floor((min(minx,off['x0'])-off['x0'])/CELL); j0=math.floor((min(miny,off['y0'])-off['y0'])/CELL)
i1=math.ceil((max(maxx,off['x0']+off['gw']*CELL)-off['x0'])/CELL); j1=math.ceil((max(maxy,off['y0']+off['gh']*CELL)-off['y0'])/CELL)
GW,GH=i1-i0,j1-j0; Xp0=off['x0']+i0*CELL; Yp0=off['y0']+j0*CELL
def shifted(m,dy,dx):
    o=np.zeros_like(m); H,W=m.shape
    ys=slice(max(dy,0),H+min(dy,0)); yd=slice(max(-dy,0),H+min(-dy,0)); xs=slice(max(dx,0),W+min(dx,0)); xd=slice(max(-dx,0),W+min(-dx,0)); o[ys,xs]=m[yd,xd]; return o
masks=[]
for l in letters:
    G=glyph(l['ch']); P=place(G,l['s'],l['th'],l['cx']-Xp0,l['cy']-Yp0,(GH*CELL,GW*CELL),l['asp'])
    masks.append(P.reshape(GH,CELL,GW,CELL).mean(axis=(1,3))>0.43)
# the i dot is part of the i glyph already (glyph() renders the whole letter)
def body_of(m):
    ext=np.zeros_like(m)
    for k in range(1,EXT+1): ext|=shifted(m,k,k//2)
    ext&=~m; solid=m|ext; ring=ndi.binary_dilation(solid,structure=np.ones((3,3)),iterations=2)&~solid
    return ext,solid,ring
out=np.zeros((GH,GW,4),np.uint8)
allbody=np.zeros((GH,GW),bool)
for m in masks: e,s_,r_=body_of(m); allbody|=s_|r_
shadow=np.zeros_like(allbody)
for k in range(1,SHADOW[0]+1): shadow|=shifted(allbody,k,round(k*SHADOW[1]/SHADOW[0]))
shadow&=~allbody; out[shadow]=(26,16,32,95)
for i,m in enumerate(masks):
    T=TONES['y' if i<SPLIT else 't']; ext,solid,ring=body_of(m); lay=np.zeros((GH,GW,4),np.uint8)
    lay[ring]=INK+(255,); lay[ext,:3]=T['deep']; lay[ext,3]=255; lay[m,:3]=T['base']; lay[m,3]=255
    tl=np.zeros_like(m)
    for k in (1,2): tl|=(~shifted(m,k,0))|(~shifted(m,0,k))
    tl&=m; br=shifted(~m,-1,0)&m
    lay[m&tl,:3]=T['hi']; lay[m&br,:3]=T['sh']; lay[m&tl&br,:3]=T['sh']
    vis=lay[...,3]>0; out[vis]=lay[vis]
text=Image.fromarray(out,'RGBA')
def save(im,name):
    big=im.resize((im.width*CELL,im.height*CELL),Image.NEAREST); big.save(name+'.png'); im.save(name+'_1x.png')
    for n,bg in (('dark',(32,34,58,255)),('light',(255,255,255,255)),('box',(240,140,22,255))):
        c=Image.new('RGBA',big.size,bg); c.alpha_composite(big); c.save(f'{name}_preview_{n}.png')
bb=text.getbbox(); save(text.crop(bb),'wm_model')
full=Image.new('RGBA',(GW,GH),(0,0,0,0)); full.alpha_composite(box,(-i0,-j0)); full.alpha_composite(text)
save(full.crop(full.getbbox()),'logo_v3'); print('canvas',GW,GH,'text bbox cells',bb)
