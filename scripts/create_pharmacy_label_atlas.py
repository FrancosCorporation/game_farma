"""Atlas 1024²: rótulos fictícios desenhados, sem doses ou fatos clínicos."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

output=Path(sys.argv[1]);output.parent.mkdir(parents=True,exist_ok=True)
image=Image.new('RGB',(1024,1024),'#F4F1DE');draw=ImageDraw.Draw(image)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold_path='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
colors=['#0D9488','#4F83AD','#B97A43','#8B65A0','#509072']
names=['BemVita','CuidaMais','Essencial','NovaVida','BemEstar','VitaCare','DiaLeve','CuidaBem','Vitalis','FarmaLar']
for i in range(16):
    x,y=(i%4)*256,(i//4)*256
    c=colors[i%5]
    if i == 10:
        # Header quad is wide; precompress horizontally to preserve glyph proportions.
        header=Image.new('RGB',(2048,256),'#0D9488')
        hd=ImageDraw.Draw(header)
        hd.text((1024,128),'FARMA • CUIDADOS',font=ImageFont.truetype(bold_path,150),anchor='mm',fill='#F4F1DE')
        image.paste(header.resize((256,256),Image.Resampling.LANCZOS),(x,y))
        continue
    if i == 14:
        draw.rectangle((x,y,x+255,y+255),fill='#DDE3E8')
        draw.text((x+128,y+55),'C     T',font=ImageFont.truetype(bold_path,45),anchor='mm',fill='#37414B')
        continue
    draw.rounded_rectangle((x+3,y+3,x+252,y+252),radius=14,fill='#F4F1DE')
    draw.rounded_rectangle((x+12,y+12,x+243,y+69),radius=10,fill=c)
    title=names[i] if i<10 else 'FARMACHECK' if i==10 else 'CUIDADOS' if i==11 else 'BEM-VINDO' if i==12 else 'SERVIÇOS' if i==13 else 'C  T' if i==14 else 'FARMÁCIA'
    draw.text((x+128,y+40),title,font=ImageFont.truetype(bold_path,27 if i<10 else 23),anchor='mm',fill='white')
    if i<10:
        draw.rounded_rectangle((x+34,y+91,x+222,y+139),radius=24,fill=c)
        draw.rectangle((x+126,y+91,x+222,y+139),fill='#DDE3E8')
        draw.text((x+128,y+172),'FarmaCheck',font=ImageFont.truetype(bold_path,20),anchor='mm',fill='#37414B')
        draw.text((x+128,y+205),'Embalagem fictícia',font=ImageFont.truetype(font_path,16),anchor='mm',fill='#536570')
    elif i==14:
        draw.rectangle((x+40,y+88,x+214,y+212),fill='#DDE3E8')
    else:
        draw.text((x+128,y+146),'FarmaCheck',font=ImageFont.truetype(bold_path,27),anchor='mm',fill=c)
image.save(output)
print(output)
