import json
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter
spr=json.load(open('sprites.json'))
INK=(26,16,32,255); NIGHT=(32,34,58,255); CARD=(240,140,22,255); TAPE=(255,208,110,255); DARK=(190,100,10,255)
SUN=(255,210,31,255); TEAL=(24,198,198,255); BERRY=(211,58,74,255); CREAM=(255,246,226,255)
def hexc(c): return tuple(int(c[k:k+2],16) for k in (1,3,5))+(255,)
def sprite(n):
    im=Image.new('RGBA',(8,8),(0,0,0,0))
    for i,c in enumerate(spr[n]):
        if c: im.putpixel((i%8,i//8),hexc(c))
    return im
def outline(im):
    big=Image.new('RGBA',(im.width+2,im.height+2),(0,0,0,0))
    m=Image.new('L',big.size,0); m.paste(im.getchannel('A').point(lambda v:255 if v else 0),(1,1))
    m=m.filter(ImageFilter.MaxFilter(3)); big.paste(Image.new('RGBA',big.size,INK),(0,0),m); big.alpha_composite(im,(1,1)); return big
def up(im,k): return im.resize((im.width*k,im.height*k),Image.NEAREST)
def icon(star='star'):
    c=Image.new('RGBA',(24,24),(0,0,0,0)); d=ImageDraw.Draw(c)
    # back rim + side flaps
    d.polygon([(4,12),(20,12),(18,10),(6,10)],fill=DARK)
    d.polygon([(4,12),(2,8),(0,13),(2,13)],fill=TAPE); d.line([(4,12),(2,8),(0,13),(2,13)],fill=INK)
    d.polygon([(19,12),(21,8),(23,13),(21,13)],fill=CARD); d.line([(19,12),(21,8),(23,13),(21,13)],fill=INK)
    c.alpha_composite(outline(sprite(star)),(6,1))
    d.rectangle([2,12,21,22],fill=CARD,outline=INK)
    d.rectangle([3,13,20,14],fill=TAPE); d.rectangle([3,21,20,21],fill=DARK)
    d.rectangle([11,15,12,20],fill=(235,170,70,255))
    return c
def wordmark(size=14):
    f=ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf',size)
    w1=f.getlength('Thingama'); w2=f.getlength('Box'); W=int(w1+w2)+8; H=int(size*1.5)
    def m(t,x):
        im=Image.new('L',(W,H),0); ImageDraw.Draw(im).text((x,3),t,font=f,fill=255,stroke_width=0); return im.point(lambda v:255 if v>110 else 0)
    a,b=m('Thingama',4),m('Box',4+w1); al=ImageChops.lighter(a,b)
    out=Image.new('RGBA',(W,H),(0,0,0,0))
    out.paste(Image.new('RGBA',(W,H),INK),(0,0),al.filter(ImageFilter.MaxFilter(3)))
    out.paste(Image.new('RGBA',(W,H),SUN),(0,0),a); out.paste(Image.new('RGBA',(W,H),TEAL),(0,0),b)
    return out.crop(out.getbbox())
F=lambda s,b=False: ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-%s.otf'%('Bold' if b else 'Regular'),s)
B=Image.new('RGBA',(1600,1120),NIGHT); d=ImageDraw.Draw(B)
def panel(x,y,w,h,title,bg=(42,44,72,255)):
    d.rounded_rectangle([x,y,x+w,y+h],12,fill=bg); d.text((x+20,y+14),title,font=F(15,True),fill=(150,154,190,255)); return x,y
d.text((40,28),'ThingamaBox',font=F(34,True),fill=SUN); d.text((290,42),'brand sketch: one idea, drawn on the game\'s own pixel grid',font=F(18),fill=(190,194,225,255))
# 1 horizontal lockup
panel(40,100,760,230,'PRIMARY LOCKUP (horizontal)')
ic=up(icon(),7); wm=up(wordmark(22),3)
B.alpha_composite(ic,(70,130)); B.alpha_composite(wm,(70+ic.width+20,130+(ic.height-wm.height)//2))
# 2 stacked w mascot
panel(820,100,740,230,'MASCOT + STACKED (sticker, social, splash)')
cc=up(outline(sprite('cupcake')),9); B.alpha_composite(cc,(850,150))
wm2=up(wordmark(18),3); B.alpha_composite(wm2,(850+cc.width+30,170))
d.text((850+cc.width+30,170+wm2.height+16),'Make a game. Make a mess.',font=F(24,True),fill=CREAM)
# 3 small sizes
panel(40,350,520,250,'THE ICON AT REAL SIZES (hand-snapped, never smoothed)')
x=70
for k,l in ((1,'24'),(2,'48'),(4,'96')):
    im=up(icon(),k); B.alpha_composite(im,(x,420+(96-im.height))); d.text((x,530),l+' px',font=F(14),fill=(150,154,190,255)); x+=im.width+50
# fake tab
d.rounded_rectangle([70,555,340,590],8,fill=(60,62,96,255)); B.alpha_composite(icon().resize((16,16),Image.NEAREST),(82,564)); d.text((108,564),'ThingamaBox',font=F(14),fill=CREAM)
# 4 palette
panel(580,350,980,250,'PALETTE (all pulled from the game itself)')
sw=[('Ink','#1a1020',INK),('Cardboard','#f08c16',CARD),('Tape','#ffd06e',TAPE),('Sunshine','#ffd21f',SUN),('Teal','#18c6c6',TEAL),('Berry','#d33a4a',BERRY),('Night','#20223a',NIGHT),('Cream','#fff6e2',CREAM)]
for i,(n,h,c) in enumerate(sw):
    x=605+i*118; d.rounded_rectangle([x,400,x+104,500],10,fill=c,outline=(110,114,150,255)); d.text((x,510),n,font=F(15,True),fill=CREAM); d.text((x,532),h,font=F(14),fill=(150,154,190,255))
d.text((605,562),'Ink outline on everything. Cardboard + Sunshine + Teal do the talking; Night is the stage.',font=F(15),fill=(190,194,225,255))
# 5 landing mock
panel(40,620,760,460,'IN USE: landing screen')
d.rectangle([60,660,780,1060],fill=(98,170,235,255))
d.rectangle([60,960,780,1060],fill=(84,170,70,255)); d.rectangle([60,1000,780,1060],fill=(120,80,40,255))
cl=Image.new('RGBA',(60,18),(0,0,0,0)); cd=ImageDraw.Draw(cl); cd.rectangle([6,6,53,17],fill=(255,255,255,255)); cd.rectangle([14,0,38,8],fill=(255,255,255,255))
B.alpha_composite(up(cl,3),(520,690)); B.alpha_composite(up(cl,2),(300,760))
B.alpha_composite(up(wordmark(18),3),(90,700))
d.text((90,790),'A toy for making games.',font=F(24,True),fill=(26,16,32,255))
d.rounded_rectangle([90,850,330,908],12,fill=SUN,outline=INK,width=4); d.text((125,864),'Make a game',font=F(24,True),fill=INK)
d.rounded_rectangle([350,850,570,908],12,fill=TEAL,outline=INK,width=4); d.text((383,864),'Make a mess',font=F(24,True),fill=INK)
B.alpha_composite(up(outline(sprite('slime')),6),(560,892)); B.alpha_composite(up(outline(sprite('crate')),5),(640,908))
# 6 rules
panel(820,620,740,460,'RULES THAT KEEP IT A BRAND')
rules=['1. The logo is made of the game\'s own sprites. Brand = product.',
'2. One pixel grid. Scale by whole numbers only (2x, 3x, 4x).',
'3. Ink outline always; no gradients, no glow, no blur.',
'4. The mark is a box with something popping out. Swap',
'    the star for a seasonal sprite; the box never changes.',
'5. Icon is hand-snapped at 16 and 32 px, not shrunk.',
'6. Voice: short verbs. "Make a game." "Make a mess."',
'    No jargon: kids read this, not engineers.',
'7. Exports/shares carry a small "Made with ThingamaBox"',
'    badge: the box icon + name, nothing more.']
for i,r in enumerate(rules): d.text((845,665+i*38),r,font=F(18),fill=CREAM)
B.convert('RGB').save('brand-board.png'); print('ok')
