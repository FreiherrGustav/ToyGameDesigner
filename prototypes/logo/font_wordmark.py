import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
CELL=6; INK=(26,16,32)
TONES={'y':dict(hi=(255,240,130),base=(255,210,31),sh=(245,160,10),deep=(214,110,8)),
       't':dict(hi=(130,238,234),base=(24,198,198),sh=(14,150,165),deep=(10,110,128))}
FONTS={'lilita':'fonts/LilitaOne-Regular.ttf','titan':'fonts/TitanOne-Regular.ttf','bowlby':'fonts/BowlbyOneSC-Regular.ttf'}
def shifted(m,dy,dx):
    o=np.zeros_like(m); H,W=m.shape
    ys=slice(max(dy,0),H+min(dy,0)); yd=slice(max(-dy,0),H+min(-dy,0)); xs=slice(max(dx,0),W+min(dx,0)); xd=slice(max(-dx,0),W+min(-dx,0))
    o[ys,xs]=m[yd,xd]; return o
def render(path,total_w_cells,pad=8,EXT=3):
    f=ImageFont.truetype(path,200); w1=f.getlength('Thingama'); w2=f.getlength('Box'); sc=(total_w_cells*CELL)/(w1+w2)
    f=ImageFont.truetype(path,int(200*sc)); w1=f.getlength('Thingama'); w2=f.getlength('Box')
    asc,desc=f.getmetrics(); Hpx=asc+desc+40; Wpx=int(w1+w2)+40
    def mask(txt,x):
        im=Image.new('L',(Wpx,Hpx),0); ImageDraw.Draw(im).text((x,20),txt,font=f,fill=255); a=np.array(im).astype(float)
        gh,gw=Hpx//CELL,Wpx//CELL; a=a[:gh*CELL,:gw*CELL].reshape(gh,CELL,gw,CELL).mean(axis=(1,3)); return a>110
    A=mask('Thingama',20); B=mask('Box',20+w1)
    F=A|B
    ys,xs=np.where(F); y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    A,B,F=[m[y0-pad:y1+pad,x0-pad:x1+pad] if False else m[y0:y1,x0:x1] for m in (A,B,F)]
    P=pad+EXT+3
    def padm(m): return np.pad(m,((P,P),(P,P)))
    A,B,F=padm(A),padm(B),padm(F)
    ext=np.zeros_like(F)
    for k in range(1,EXT+1): ext|=shifted(F,k,k//2)
    ext&=~F
    solid=F|ext
    ring=ndi.binary_dilation(solid,structure=np.ones((3,3)),iterations=2)&~solid
    H,W=F.shape; out=np.zeros((H,W,4),np.uint8)
    out[ring]=INK+(255,)
    tl=np.zeros_like(F); br=np.zeros_like(F)
    for k in (1,2): tl|=~shifted(F,k,0)|~shifted(F,0,k)
    br|=~shifted(F,-1,0)
    for m,fam in ((A,'y'),(B,'t')):
        T=TONES[fam]
        out[ext&ndi.binary_dilation(m,iterations=EXT+1),:3]=T['deep']; out[ext&ndi.binary_dilation(m,iterations=EXT+1),3]=255
        out[m,:3]=T['base']; out[m,3]=255
        out[m&tl,:3]=T['hi']; out[m&br,:3]=T['sh']; out[m&tl&br,:3]=T['sh']
    return out
if __name__=='__main__':
    old=np.load('oldtext_keep.npy'); ys,xs=np.where(old); oy=(ys.min()+ys.max())//2; ox=(xs.min()+xs.max())//2; ow=xs.max()-xs.min()
    base=np.array(Image.open('logo_ai_1x.png'))
    # inpaint old text region from the box above it (nearest clean cell in the same column)
    big=ndi.binary_dilation(old,iterations=3)
    for k in range(1,8): big|=shifted(ndi.binary_dilation(old,iterations=2),k,0)   # old drop shadow sits below the outline
    clean=base.copy()
    H,W=big.shape
    for x in range(W):
        y=0
        while y<H:
            if not big[y,x]: y+=1; continue
            a0=y
            while y<H and big[y,x]: y+=1
            b0=y-1; top=base[a0-1,x].astype(float) if a0>0 else None; bot=base[b0+1,x].astype(float) if b0+1<H else None
            for yy in range(a0,b0+1):
                if top is not None and bot is not None and top[3]>0 and bot[3]>0:
                    t=(yy-a0+1)/(b0-a0+2); clean[yy,x]=np.round(top*(1-t)+bot*t).astype(np.uint8)
                elif top is not None and top[3]>0 and (bot is None or bot[3]==0) and False: clean[yy,x]=top.astype(np.uint8)
                else: clean[yy,x]=[0,0,0,0]
    for name,path in FONTS.items():
        wm=render(path,int(ow*0.97)); h,w=wm.shape[:2]
        y0=oy-h//2; x0=ox-w//2; full=clean.copy()
        y0=max(y0,0); x0=max(x0,0); hh=min(h,full.shape[0]-y0); ww=min(w,full.shape[1]-x0)
        sub=full[y0:y0+hh,x0:x0+ww]; part=wm[:hh,:ww]; m=part[...,3]>0; sub[m]=part[m]
        Image.fromarray(wm,'RGBA').resize((w*CELL,h*CELL),Image.NEAREST).save(f'wordmark_{name}.png')
        im=Image.fromarray(full,'RGBA').resize((W*CELL,H*CELL),Image.NEAREST); im.save(f'logo_{name}.png')
        bg=Image.new('RGBA',im.size,(32,34,58,255)); bg.alpha_composite(im); bg.save(f'logo_{name}_preview.png'); print(name,wm.shape)
