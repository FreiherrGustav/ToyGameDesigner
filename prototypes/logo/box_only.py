import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
CELL=6; INK=(26,16,32,255)
g=np.array(Image.open('logo_ai_1x.png')); H,W,_=g.shape
TOP=138; TOPX=130; XL,XR=49,277; XC=161; YS=220; YB=241                       # body: top row, left/right outline x, crease x, side bottom, apex
def sh(m,dy,dx):
    o=np.zeros_like(m); ys=slice(max(dy,0),m.shape[0]+min(dy,0)); yd=slice(max(-dy,0),m.shape[0]+min(-dy,0)); xs=slice(max(dx,0),m.shape[1]+min(dx,0)); xd=slice(max(-dx,0),m.shape[1]+min(-dx,0)); o[ys,xs]=m[yd,xd]; return o
im=Image.new('L',(W,H),0); ImageDraw.Draw(im).polygon([(XL,TOPX),(XR,TOPX),(XR,YS),(XC,YB),(XL,YS)],fill=255)
P=np.array(im)>0
inner=ndi.binary_erosion(P,structure=np.ones((3,3)),iterations=3)
ring=P&~inner
ring&=(np.mgrid[0:H,0:W][0]>=TOP-2)|(np.mgrid[0:H,0:W][1]<XL+3)|(np.mgrid[0:H,0:W][1]>XR-3)
yy,xx=np.mgrid[0:H,0:W]; left=xx<XC
out=g.copy(); out[(yy>=TOP)]=[0,0,0,0]; keep_flaps=g.copy()                                 # clear old lettering and rough body, keep everything above
face=np.zeros((H,W,4),np.uint8)
face[inner&left]=(255,122,0,255); face[inner&~left]=(226,74,0,255)
top=inner&(yy<TOP+14)&(yy>=TOP)                                       # shadow under the flaps
face[top&left]=(217,61,0,255); face[top&~left]=(176,46,0,255)
band=inner&~sh(inner,-9,0)                                            # lighter bevel along the bottom edges
face[band&left]=(255,150,34,255); face[band&~left]=(236,98,12,255)
ln=band&~sh(band,1,0)&inner&False
crease=inner&(abs(xx-XC)<=2)&~band; face[crease]=(255,160,50,255)
crease_r=inner&(xx>XC+2)&(xx<=XC+4)&~band; face[crease_r]=(190,56,0,255)
# a few corrugation dashes so the cardboard is not a flat fill
rng=np.random.default_rng(3)
for _ in range(34):
    y=int(rng.integers(TOP+18,YS-14)); x=int(rng.integers(XL+8,XR-24)); l=int(rng.integers(8,18))
    if abs(x-XC)<14 or abs(x+l-XC)<14: continue
    seg=face[y,x:x+l]; m=(seg[:,3]>0)
    dark=np.array((226,98,0,255) if x<XC else (196,58,0,255),np.uint8); seg[m]=dark
face[ring]=INK
body=P.copy()
paint=body&((yy>=TOP)|(g[...,3]==0))
out[paint]=face[paint]
Image.fromarray(out,'RGBA').save('box_with_contents_1x.png')
im2=Image.fromarray(out,'RGBA').resize((W*CELL,H*CELL),Image.NEAREST); im2.save('box_with_contents.png')
d=Image.new('RGBA',im2.size,(32,34,58,255)); d.alpha_composite(im2); d.save('box_with_contents_preview.png')
