import sys
with open('src/App.tsx', 'r') as f:
    text = f.read()

text = text.replace("formatter={(value: number) =>", "formatter={(value: any) =>")

with open('src/App.tsx', 'w') as f:
    f.write(text)
