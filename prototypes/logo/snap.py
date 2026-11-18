import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
CELL=int(sys.argv[1]) if len(sys.argv)>1 else 10
NCOL=int(sys.argv[2]) if len(sys.argv)>2 else 28
im=np.array(Image.open('source_ai.webp').convert('RGB')).astype(np.int32)
H,W,_=im.shape
# 1. background = near-white connected to the border
near=(im.min(axis=2)>=232)&((im.max(axis=2)-im.min(axis=2))<14)
lab,n=ndi.label(near)
edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
bg=np.isin(lab,list(edge))
fg=~bg
fg=ndi.binary_opening(fg,iterations=2)           # kill specks of checker
fg=ndi.binary_fill_holes(fg)
lab,n=ndi.label(fg); sizes=ndi.sum(fg,lab,range(1,n+1)); fg=np.isin(lab,[i+1 for i,z in enumerate(sizes) if z>3000])
# 2. crop
ys,xs=np.where(fg); pad=CELL
y0,y1,x0,x1=max(0,ys.min()-pad),min(H,ys.max()+pad),max(0,xs.min()-pad),min(W,xs.max()+pad)
im=im[y0:y1,x0:x1]; fg=fg[y0:y1,x0:x1]
H,W=fg.shape; gh,gw=H//CELL,W//CELL
im=im[:gh*CELL,:gw*CELL]; fg=fg[:gh*CELL,:gw*CELL]
# 3. per-cell colour from foreground pixels only (no white bleed), then alpha vote
m=fg.astype(np.float32)[...,None]
cs=(im*m).reshape(gh,CELL,gw,CELL,3).sum(axis=(1,3)); cn=m.reshape(gh,CELL,gw,CELL,1).sum(axis=(1,3))
cell=cs/np.maximum(cn,1); alpha=(cn[...,0]/(CELL*CELL))>0.5
# 4. palette reduction, no dithering
from PIL import ImageEnhance
small=Image.fromarray(np.clip(cell,0,255).astype(np.uint8))
small=ImageEnhance.Color(small).enhance(1.35)
q=small.quantize(colors=NCOL,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
out=np.array(q); rgba=np.dstack([out,(alpha*255).astype(np.uint8)])
# snap darkest colours to a single ink
lum=out.sum(axis=2); ink=lum<110; rgba[ink,:3]=(26,16,32)
g=Image.fromarray(rgba,'RGBA'); g.save('logo_ai_1x.png')
g.resize((gw*CELL,gh*CELL),Image.NEAREST).save('logo_ai.png')
bgc=Image.new('RGBA',(gw*CELL,gh*CELL),(32,34,58,255)); bgc.alpha_composite(g.resize((gw*CELL,gh*CELL),Image.NEAREST)); bgc.save('logo_ai_preview_dark.png')
print(gw,gh,len(np.unique(out.reshape(-1,3),axis=0)))
