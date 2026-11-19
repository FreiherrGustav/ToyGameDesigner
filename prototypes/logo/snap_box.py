import sys, os, json, numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage as ndi
CELL=int(sys.argv[1]) if len(sys.argv)>1 else 6
NCOL=int(sys.argv[2]) if len(sys.argv)>2 else 64
SAT=float(sys.argv[3]) if len(sys.argv)>3 else 1.15
im=np.array(Image.open(os.environ.get('BOX_SRC','source_box.jpg')).convert('RGB')).astype(np.int32); H,W,_=im.shape
near=(im.min(axis=2)>=225)&((im.max(axis=2)-im.min(axis=2))<18)
lab,n=ndi.label(near); edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
fg=~np.isin(lab,list(edge)); fg=ndi.binary_opening(fg,iterations=2); fg=ndi.binary_fill_holes(fg)
lab,n=ndi.label(fg); sz=ndi.sum(fg,lab,range(1,n+1)); fg=np.isin(lab,[i+1 for i,s in enumerate(sz) if s>3000])
ys,xs=np.where(fg); pad=CELL
y0,y1,x0,x1=max(0,ys.min()-pad),min(H,ys.max()+pad),max(0,xs.min()-pad),min(W,xs.max()+pad)
im=im[y0:y1,x0:x1]; fg=fg[y0:y1,x0:x1]; H,W=fg.shape; gh,gw=H//CELL,W//CELL
im=im[:gh*CELL,:gw*CELL]; fg=fg[:gh*CELL,:gw*CELL]
m=fg.astype(np.float32)[...,None]
cs=(im*m).reshape(gh,CELL,gw,CELL,3).sum(axis=(1,3)); cn=m.reshape(gh,CELL,gw,CELL,1).sum(axis=(1,3))
cell=cs/np.maximum(cn,1); alpha=(cn[...,0]/(CELL*CELL))>0.5
small=ImageEnhance.Color(Image.fromarray(np.clip(cell,0,255).astype(np.uint8))).enhance(SAT)
q=small.quantize(colors=NCOL,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
out=np.array(q); out[out.sum(axis=2)<110]=(26,16,32)
rgba=np.dstack([out,(alpha*255).astype(np.uint8)])
import colorsys
hsv=np.array([[colorsys.rgb_to_hsv(*(p/255)) for p in row] for row in cell]); hue=hsv[...,0]*360; sat=hsv[...,1]; val=hsv[...,2]
yy,xx=np.mgrid[0:gh,0:gw]
def nearest(pal,c): return min(pal,key=lambda p:sum((a-b)**2 for a,b in zip(p,c)))
GEM=[(150,235,252),(40,196,246),(24,140,236),(34,92,206)]
gem=(yy>30)&(yy<62)&(xx>170)&(xx<216)&(hue>165)&(hue<235)&(sat>0.5)&(val>0.55)&alpha
for y,x in zip(*np.where(gem)): rgba[y,x,:3]=nearest(GEM,tuple(cell[y,x]*1.05))
GRN=[(120,226,70),(50,190,40),(28,140,34)]
grn=(yy>62)&(yy<110)&(xx>30)&(xx<90)&(hue>70)&(hue<165)&(sat>0.35)&alpha
for y,x in zip(*np.where(grn)): rgba[y,x,:3]=nearest(GRN,tuple(cell[y,x]*1.05))
print('gem',int(gem.sum()),'green',int(grn.sum()))
g=Image.fromarray(rgba,'RGBA'); g.save('box2_1x.png')
big=g.resize((gw*CELL,gh*CELL),Image.NEAREST); big.save('box2.png')
d=Image.new('RGBA',big.size,(32,34,58,255)); d.alpha_composite(big); d.save('box2_preview_dark.png'); print(gw,gh); json.dump(dict(x0=int(x0),y0=int(y0),cell=CELL,gw=int(gw),gh=int(gh)),open(os.environ.get('BOX_OFF','box2_offset.json'),'w'))
