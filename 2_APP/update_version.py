import os
import re

# Versión actual
VERSION = "17"

def update_html_files():
    directory = "."
    for filename in os.listdir(directory):
        if filename.endswith(".html"):
            filepath = os.path.join(directory, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Reemplazar v=X por v=VERSION
            new_content = re.sub(r'v=\d+', f'v={VERSION}', content)
            
            if content != new_content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {filename}")

if __name__ == "__main__":
    update_html_files()
