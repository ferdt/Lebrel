import glob
files = glob.glob('c:/repo/Lebrel/2_APP/*.html')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        txt = file.read()
    txt = txt.replace('v=21', 'v=23')
    with open(f, 'w', encoding='utf-8') as file:
        file.write(txt)
