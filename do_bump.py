import glob
import os
import re

print("Updating version to 1.0.26 and cache to v26")

html_files = glob.glob('c:/repo/Lebrel/2_APP/*.html')
for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        txt = file.read()
    txt = txt.replace('v1.0.25', 'v1.0.26')
    txt = re.sub(r'v=\d+', 'v=26', txt)
    with open(f, 'w', encoding='utf-8') as file:
        file.write(txt)

config_file = 'c:/repo/Lebrel/2_APP/js/config.js'
with open(config_file, 'r', encoding='utf-8') as file:
    txt = file.read()
txt = txt.replace("VERSION: '1.0.25'", "VERSION: '1.0.26'")
txt = re.sub(r"CACHE_VERSION: '\d+'", "CACHE_VERSION: '26'", txt)
with open(config_file, 'w', encoding='utf-8') as file:
    file.write(txt)

sw_file = 'c:/repo/Lebrel/2_APP/sw.js'
with open(sw_file, 'r', encoding='utf-8') as file:
    txt = file.read()
txt = re.sub(r"CACHE_NAME = 'lebrel-v\d+'", "CACHE_NAME = 'lebrel-v26'", txt)
with open(sw_file, 'w', encoding='utf-8') as file:
    file.write(txt)

uv_file = 'c:/repo/Lebrel/2_APP/update_version.py'
if os.path.exists(uv_file):
    with open(uv_file, 'r', encoding='utf-8') as file:
        txt = file.read()
    txt = re.sub(r'VERSION = "\d+"', 'VERSION = "26"', txt)
    with open(uv_file, 'w', encoding='utf-8') as file:
        file.write(txt)

print("Done")
