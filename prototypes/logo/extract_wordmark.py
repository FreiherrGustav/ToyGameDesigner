import numpy as np, colorsys
from PIL import Image
from scipy import ndimage as ndi
CELL=6
g=np.array(Image.open('logo_ai_1x.png')); h,w,_=g.shape
rgb=g[...,:3].astype(float)/255; a=g[...,3]>0
hsv=np.array([[colorsys.rgb_to_hsv(*p) for p in row] for row in rgb]); hue=hsv[...,0]*360; sat=hsv[...,1]; val=hsv[...,2]
yy,xx=np.mgrid[0:h,0:w]
band=(yy>=140)
yel=(hue>38)&(hue<58)&(sat>0.7)&(val>0.8)&band&a           # letter yellow (box orange is hue ~25-32)
teal=(hue>165)&(hue<200)&(sat>0.45)&band&a                 # letter teal
fill=yel|teal
fill=ndi.binary_opening(fill,iterations=1)                  # drop stray box-colour cells
lab,n=ndi.label(fill); sz=ndi.sum(fill,lab,range(1,n+1)); fill=np.isin(lab,[i+1 for i,s in enumerate(sz) if s>=12])
M=ndi.binary_closing(fill,structure=np.ones((3,3)),iterations=2)
shade=ndi.binary_dilation(M,iterations=2)                   # includes the orange shade rows under letters
ink=(g[...,0]==26)&(g[...,1]==16)&(g[...,2]==32)
core=ndi.binary_fill_holes(M|(shade&~ink&a))
ring=ndi.binary_dilation(core,structure=np.ones((3,3)),iterations=2)&~core
keep=(core|ring)
# ---- rebuild the bevel from clean tones (yellow = brand sunshine #ffd21f) ----
TONES={'y':dict(hi=(255,238,120),base=(255,210,31),sh=(245,160,10),deep=(214,110,8)),
       't':dict(hi=(120,236,232),base=(24,198,198),sh=(14,150,165),deep=(10,110,128))}
def shifted(m,dy,dx):
    o=np.zeros_like(m); H,W=m.shape
    ys=slice(max(dy,0),H+min(dy,0)); yd=slice(max(-dy,0),H+min(-dy,0))
    xs=slice(max(dx,0),W+min(dx,0)); xd=slice(max(-dx,0),W+min(-dx,0))
    o[ys,xs]=m[yd,xd]; return o                      # o[y,x]=m[y-dy,x-dx]
S=core
topleft=np.zeros_like(S); botright=np.zeros_like(S)
for k in (1,2):
    topleft|=~shifted(S,k,0)|~shifted(S,0,k)         # cell above / left is outside the letter
for k in (1,2):
    botright|=~shifted(S,-k,0)|~shifted(S,0,-k)      # cell below / right is outside
tealside=ndi.binary_dilation(teal,iterations=6)
out=g.copy(); out[ring]=[26,16,32,255]
for fam,m in (('y',core&~tealside),('t',core&tealside)):
    T=TONES[fam]
    base=m&M; edge_lo=m&~M                           # edge_lo = old shade rows
    for name,mask in (('base',base),('hi',base&topleft),('sh',base&botright),('deep',edge_lo)):
        out[mask,:3]=T[name]
    out[base&topleft&botright,:3]=T['sh']            # thin strokes: keep the shade
    out[m&ink,:3]=(26,16,32)                         # counters stay ink
out[~keep]=[0,0,0,0]
ys,xs=np.where(keep); pad=2
y0,y1,x0,x1=ys.min()-pad,ys.max()+pad+1,xs.min()-pad,xs.max()+pad+1
wm=out[y0:y1,x0:x1]
im=Image.fromarray(wm,'RGBA'); im.save('wordmark_1x.png')
big=im.resize((im.width*CELL,im.height*CELL),Image.NEAREST); big.save('wordmark.png')
for name,bg in (('dark',(32,34,58,255)),('light',(255,255,255,255))):
    c=Image.new('RGBA',big.size,bg); c.alpha_composite(big); c.save(f'wordmark_preview_{name}.png')
# ---- put the rebuilt lettering back into the full logo ----
full=g.copy(); region=full[y0:y1,x0:x1]; place=wm[...,3]>0; region[place]=wm[place]
Image.fromarray(full,'RGBA').save('logo_final_1x.png')
fb=Image.fromarray(full,'RGBA').resize((full.shape[1]*CELL,full.shape[0]*CELL),Image.NEAREST); fb.save('logo_final.png')
d=Image.new('RGBA',fb.size,(32,34,58,255)); d.alpha_composite(fb); d.save('logo_final_preview_dark.png')
print(big.size)
