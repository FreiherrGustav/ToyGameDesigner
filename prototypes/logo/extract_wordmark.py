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
ys,xs=np.where(keep); pad=2
y0,y1,x0,x1=ys.min()-pad,ys.max()+pad+1,xs.min()-pad,xs.max()+pad+1
out=g.copy(); out[ring]=[26,16,32,255]; out[~keep]=[0,0,0,0]; out=out[y0:y1,x0:x1]
im=Image.fromarray(out,'RGBA'); im.save('wordmark_1x.png')
big=im.resize((im.width*CELL,im.height*CELL),Image.NEAREST); big.save('wordmark.png')
for name,bg in (('dark',(32,34,58,255)),('light',(255,255,255,255))):
    c=Image.new('RGBA',big.size,bg); c.alpha_composite(big); c.save(f'wordmark_preview_{name}.png')
print(big.size)
