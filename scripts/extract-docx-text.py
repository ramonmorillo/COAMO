#!/usr/bin/env python3
"""Extrae el texto de un .docx párrafo a párrafo (cuerpo, tablas, cabeceras y pies), en orden.

Uso: python3 -I scripts/extract-docx-text.py documento.docx > tests/fixtures/source/x.txt
Sirve para regenerar los textos de referencia con los que tests/questionnaireIntegrity.test.ts
comprueba que cada ítem y opción digital coincide literalmente con el documento fuente.
"""
import re
import sys
import zipfile
from html import unescape

def paragraphs(xml: str):
    for p in re.findall(r'<w:p[ >].*?</w:p>', xml, flags=re.S):
        p = re.sub(r'<w:tab/>', ' ', p)
        p = re.sub(r'<w:br/>', ' ', p)
        text = ''.join(re.findall(r'<w:t(?: [^>]*)?>([^<]*)</w:t>', p))
        text = unescape(text).strip()
        if text:
            yield text

with zipfile.ZipFile(sys.argv[1]) as z:
    names = ['word/document.xml'] + sorted(n for n in z.namelist() if re.match(r'word/(header|footer)\d+\.xml', n))
    for name in names:
        for line in paragraphs(z.read(name).decode('utf-8')):
            print(line)
