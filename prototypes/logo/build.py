import json
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter
W,H,S=256,196,6
spr=json.load(open('sprites.json'))
INK=(26,16,32,255)
def new(): return Image.new('RGBA',(W,H),(0,0,0,0))
def dilate(mask,r=1):
    return mask.filter(ImageFilter.MaxFilter(2*r+1))
def sprite(art,scale):
    im=Image.new('RGBA',(8,8),(0,0,0,0))
    for i,c in enumerate(art):
        if c:
            im.putpixel((i%8,i//8),tuple(int(c[k:k+2],16) for k in (1,3,5))+(255,))
    return im.resize((8*scale,8*scale),Image.NEAREST)
def outlined(im,r=1):
    a=im.getchannel('A').point(lambda v:255 if v>0 else 0)
    o=Image.new('RGBA',im.size,(0,0,0,0)); big=Image.new('RGBA',(im.width+2*r,im.height+2*r),(0,0,0,0))
    ring=dilate(Image.new('L',big.size,0),1)
    m=Image.new('L',big.size,0); m.paste(a,(r,r)); m=dilate(m,r)
    big.paste(Image.new('RGBA',big.size,INK),(0,0),m); big.alpha_composite(im,(r,r)); return big
def put(layer,im,x,y): layer.alpha_composite(outlined(im),(x-1,y-1))
# palette
O1=(255,176,48,255);O2=(240,140,22,255);O3=(205,108,12,255);O4=(150,74,8,255);OL=(255,208,110,255)
def poly(layer,pts,fill,out=True):
    d=ImageDraw.Draw(layer)
    d.polygon(pts,fill=fill)
    if out: d.line(pts+[pts[0]],fill=INK,width=2,joint='curve')
canvas=new()
CX=W//2
FL,FR,FT,FB=22,234,104,172       # front face
BL,BR,BT=40,216,82              # back rim
# back flap pair (behind)
poly(canvas,[(BL,BT),(BR,BT),(BR-6,BT-4),(BL+6,BT-4)],O3)
# opening interior
poly(canvas,[(FL,FT),(FR,FT),(BR,BT),(BL,BT)],O4)
# side flaps (open outward, symmetric)
poly(canvas,[(BL,BT),(FL,FT),(2,94),(14,66)],O1)
poly(canvas,[(BL+3,BT+1),(FL+2,FT-2),(10,93),(18,70)],OL,out=False)
poly(canvas,[(BR,BT),(FR,FT),(W-2,94),(W-14,66)],O2)
# characters
chars=[('spring',4,30,0,110),('cupcake',6,70,0,112),('crate',4,124,0,110),('slime',4,160,0,110),('bomb',4,190,0,100),
       ('gem',4,128,0,76),('coin',4,166,0,78),('star',4,100,14,0)]
chars=[(n,sc,x,(y if y else b-8*sc)) for n,sc,x,y,b in chars]
for n,sc,x,y in chars: put(canvas,sprite(spr[n],sc),x,y)
# front face
fl=new(); d=ImageDraw.Draw(fl)
d.rectangle([FL,FT,FR,FB],fill=O2)
d.rectangle([FL,FT,FR,FT+7],fill=OL)           # rim highlight band
d.rectangle([FL,FT+8,FR,FT+9],fill=O1)
d.rectangle([FL,FB-8,FR,FB],fill=O3)            # base shade
d.rectangle([FL,FB-9,FR,FB-9],fill=O2)
d.rectangle([CX-9,FT+10,CX+9,FB-9],fill=(235,170,70,255)) # tape
for x in (FL+4,FR-8):
    d.rectangle([x,FT+10,x+3,FT+12],fill=OL)
d.rectangle([FL,FT,FR,FB],outline=INK,width=2)
canvas.alpha_composite(fl)
# text
def textlayer(txt,font,fill,xy,stroke=1):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).text(xy,txt,font=font,fill=255,stroke_width=stroke,stroke_fill=255)
    return m.point(lambda v:255 if v>110 else 0)
sz=46
while True:
    f=ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf',sz)
    w1=f.getlength('Thingama'); w2=f.getlength('Box'); tot=w1+w2
    if tot<=234 or sz<20: break
    sz-=1
print('font',sz,tot)
x0=(W-tot)/2; ty=118
m1=textlayer('Thingama',f,None,(x0,ty),stroke=1)
m2=textlayer('Box',f,None,(x0+w1,ty),stroke=1)
allm=ImageChops.lighter(m1,m2)
shadow=ImageChops.offset(allm,0,3)
outl=dilate(allm,2)
canvas.paste(Image.new('RGBA',(W,H),O4),(0,0),ImageChops.offset(dilate(allm,2),0,3))
canvas.paste(Image.new('RGBA',(W,H),INK),(0,0),outl)
canvas.paste(Image.new('RGBA',(W,H),(255,206,28,255)),(0,0),m1)
canvas.paste(Image.new('RGBA',(W,H),(24,198,198,255)),(0,0),m2)
# text highlight/shade bands
def band(mask,hi,lo):
    top=ImageChops.multiply(mask,ImageChops.invert(ImageChops.offset(mask,0,2)))
    bot=ImageChops.multiply(mask,ImageChops.invert(ImageChops.offset(mask,0,-3)))
    canvas.paste(Image.new('RGBA',(W,H),hi),(0,0),top); canvas.paste(Image.new('RGBA',(W,H),lo),(0,0),bot)
band(m1,(255,240,140,255),(240,150,10,255)); band(m2,(140,240,235,255),(10,130,150,255))
# crop to content
bb=canvas.getbbox(); pad=4
canvas=canvas.crop((max(0,bb[0]-pad),max(0,bb[1]-pad),min(W,bb[2]+pad),min(H,bb[3]+pad)))
out=canvas.resize((canvas.width*S,canvas.height*S),Image.NEAREST)
out.save('logo.png'); canvas.save('logo_1x.png')
bg=Image.new('RGBA',out.size,(32,34,56,255)); bg.alpha_composite(out); bg.save('preview_dark.png')
w=Image.new('RGBA',out.size,(255,255,255,255)); w.alpha_composite(out); w.save('preview_light.png')
print(out.size,canvas.size)
