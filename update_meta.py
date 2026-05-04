import glob, os
files = glob.glob('c:/repo/Lebrel/2_APP/*.html')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        txt = file.read()
    if '<meta name="mobile-web-app-capable"' not in txt:
        txt = txt.replace('<meta name="apple-mobile-web-app-capable" content="yes">', '<meta name="mobile-web-app-capable" content="yes">\n    <meta name="apple-mobile-web-app-capable" content="yes">')
        with open(f, 'w', encoding='utf-8') as file:
            file.write(txt)
