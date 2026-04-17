import sys
with open('src/App.tsx', 'r') as f:
    text = f.read()

text = text.replace(r"\`\$\$", "`$$")
text = text.replace(r"\`\$", "`$")
text = text.replace(r"}\`", "}`")
text = text.replace(r"%\`", "%`")

with open('src/App.tsx', 'w') as f:
    f.write(text)
